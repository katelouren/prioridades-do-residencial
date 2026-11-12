"""Assistente: confirmação humana, idempotência, fontes permitidas e fallback."""
import io
from http.client import IncompleteRead, RemoteDisconnected
import json
import os
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import server


class AssistantFlow(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.previous=server.DATABASE
        server.DATABASE=os.path.join(self.tmp.name,'assistant.sqlite3')
        import demo
        demo.seed()
        self.env=patch.dict(os.environ,{'GEMINI_API_KEY':'','GEMINI_MODEL':''});self.env.start()
        self.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.http.shutdown();self.http.server_close();self.thread.join();self.env.stop()
        server.DATABASE=self.previous;self.tmp.cleanup()
    def api(self,path,data=None,code='demo-morador-1'):
        req=Request(f'http://127.0.0.1:{self.http.server_port}'+path,data=None if data is None else json.dumps(data).encode(),
                    headers={'Authorization':'Bearer '+code,'Content-Type':'application/json'})
        try:
            with urlopen(req) as response:return response.status,json.load(response)
        except HTTPError as response:
            with response:return response.code,json.load(response)
    def preview(self,**data):return self.api('/api/assistant/cleaning/preview',{'message':'A academia está suja',**data})

    def test_missing_information_preview_edit_and_explicit_confirmation(self):
        status,payload=self.preview(message='Está suja');self.assertEqual(status,200)
        self.assertFalse(payload['ready']);self.assertIn('local',payload['missing'])
        status,payload=self.preview(message='Academia');self.assertFalse(payload['ready']);self.assertIn('description',payload['missing'])
        status,payload=self.preview();self.assertEqual(status,200);self.assertTrue(payload['ready'])
        self.assertEqual(payload['summary'],{'local':'Academia','description':'A academia está suja','team':'Equipe de limpeza'})
        self.assertEqual(self.api('/api/requests')[1]['requests'],[])
        body={'token':payload['token'],'local':'Academia','description':'Os aparelhos estão sujos.','team':'Equipe forjada','residence_id':2}
        status,result=self.api('/api/assistant/cleaning/confirm',body);self.assertEqual(status,200)
        self.assertEqual(result['request']['description'],'Os aparelhos estão sujos.')
        self.assertEqual(result['request']['team'],'Equipe de limpeza');self.assertEqual(result['request']['status'],'Pendente')
        self.assertEqual(len(self.api('/api/cleaning',code=server.ADMIN)[1]['orders']),1)
        protocol=result['request']['protocol']
        self.assertEqual(self.api('/api/cleaning/'+protocol+'/complete',{'feedback':'Aparelhos higienizados'},server.ADMIN)[0],200)
        self.assertEqual(self.api('/api/requests/'+protocol)[1]['request']['feedback'],'Aparelhos higienizados')

    def test_confirmation_is_idempotent_even_with_concurrent_clicks(self):
        status,payload=self.preview();self.assertEqual(status,200)
        body={'token':payload['token'],'local':'Academia','description':'A academia está suja'}
        with ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(lambda _:self.api('/api/assistant/cleaning/confirm',body),range(4)))
        self.assertEqual([r[0] for r in results],[200]*4)
        self.assertEqual(len({r[1]['request']['protocol'] for r in results}),1)
        with closing(server.connect()) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM service_requests').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT count(*) FROM work_orders').fetchone()[0],1)
        server.init()
        self.assertEqual(self.api('/api/assistant/cleaning/confirm',body)[1]['request']['protocol'],results[0][1]['request']['protocol'])

    def test_tokens_roles_and_residence_privacy(self):
        status,payload=self.preview();self.assertEqual(status,200)
        body={'token':payload['token'],'local':'Academia','description':'A academia está suja'}
        self.assertEqual(self.api('/api/assistant/cleaning/confirm',body,'demo-morador-2')[0],404)
        for path,data in [('/api/assistant/question',{'question':'Limpeza'}),('/api/assistant/cleaning/preview',{'message':'Academia suja'}),('/api/assistant/cleaning/confirm',body)]:
            self.assertEqual(self.api(path,data,server.ADMIN)[0],403)
            self.assertEqual(self.api(path,data,'codigo-invalido')[0],401)
        with closing(server.connect()) as db,db:replacement=server.issue_code(db,'DEMO-01')
        self.assertEqual(self.api('/api/assistant/cleaning/confirm',body)[0],401)
        status,result=self.api('/api/assistant/cleaning/confirm',body,replacement);self.assertEqual(status,200)
        protocol=result['request']['protocol']
        self.assertEqual(self.api('/api/requests/'+protocol,code='demo-morador-2')[0],404)
        self.assertEqual(self.api('/api/requests',code='demo-morador-2')[1]['requests'],[])

    def test_invalid_edit_and_database_failure_do_not_create_partial_order(self):
        status,payload=self.preview();self.assertEqual(status,200)
        body={'token':payload['token'],'local':'Piscina','description':'Suja'}
        self.assertEqual(self.api('/api/assistant/cleaning/confirm',body)[0],400)
        body.update(local='Academia',description=' ')
        self.assertEqual(self.api('/api/assistant/cleaning/confirm',body)[0],400)
        body['description']='A academia está suja'
        with closing(server.connect()) as db,db:
            db.execute("CREATE TRIGGER fail_assistant_order BEFORE INSERT ON work_orders BEGIN SELECT RAISE(ABORT,'forced failure'); END")
        self.assertEqual(self.api('/api/assistant/cleaning/confirm',body)[0],500)
        with closing(server.connect()) as db,db:
            self.assertEqual(db.execute('SELECT count(*) FROM service_requests').fetchone()[0],0)
            self.assertIsNone(db.execute('SELECT request_id FROM assistant_drafts').fetchone()[0])
            db.execute('DROP TRIGGER fail_assistant_order')
        self.assertEqual(self.api('/api/assistant/cleaning/confirm',body)[0],200)

    def test_questions_use_only_published_resident_sources_without_ai(self):
        with closing(server.connect()) as db,db:
            db.execute("UPDATE surveys SET response='SEGREDO_NAO_PUBLICADO' WHERE closed=0")
        self.api('/api/requests',{'local':'Academia','category':'Higiene','description':'PRIVADO_OUTRA_RESIDENCIA'},'demo-morador-2')
        status,reply=self.api('/api/assistant/question',{'question':'Decoração de um evento','context':'contexto forjado'})
        self.assertEqual(status,200);self.assertEqual(reply['mode'],'local')
        self.assertTrue(any(s['href']=='#consulta/2' for s in reply['sources']))
        self.assertNotIn('SEGREDO_NAO_PUBLICADO',json.dumps(reply));self.assertNotIn('PRIVADO_OUTRA_RESIDENCIA',json.dumps(reply))
        status,reply=self.api('/api/assistant/question',{'question':'Decisão sobre iluminação'})
        self.assertTrue(any('iluminação' in s['content'] for s in reply['sources']))
        status,reply=self.api('/api/assistant/question',{'question':'contato para limpeza'})
        self.assertTrue(any(s['href']=='#regras' for s in reply['sources']))
        status,reply=self.api('/api/assistant/question',{'question':'Zorbax-731 desconhecido'})
        self.assertIn('Não encontrei',reply['answer'])
        self.assertEqual(self.api('/api/assistant/question',{'question':' '})[0],400)

    def test_authenticated_gemini_uses_public_context_and_acknowledges_missing_contact(self):
        with closing(server.connect()) as db,db:
            db.execute("UPDATE surveys SET response='SEGREDO_NAO_PUBLICADO' WHERE closed=0")
        self.api('/api/requests',{'local':'Academia','category':'Higiene','description':'PRIVADO_OUTRA_RESIDENCIA'},'demo-morador-2')
        captured=[]
        def respond(request,timeout):
            context=json.loads(json.loads(request.data)['contents'][0]['parts'][0]['text']);captured.append(context)
            self.assertNotIn('SEGREDO_NAO_PUBLICADO',json.dumps(context))
            self.assertNotIn('PRIVADO_OUTRA_RESIDENCIA',json.dumps(context))
            self.assertNotIn('residence_id',json.dumps(context));self.assertNotIn('contexto forjado',json.dumps(context))
            source=context['fontes'][0]
            answer=('O telefone não está disponível: o contato está A informar.' if 'telefone' in context['pergunta']
                    else 'A decisão publicada trata da iluminação.')+' ['+source['id']+']'
            return io.BytesIO(json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':answer}]}}]}).encode())
        with patch.dict(os.environ,{'GEMINI_API_KEY':'chave-ficticia-pr','GEMINI_MODEL':'modelo-ficticio'}),patch('gemini_pr.urlopen',side_effect=respond):
            status,result=self.api('/api/assistant/question',{'question':'Decisão sobre iluminação','context':'contexto forjado'})
            self.assertEqual(status,200);self.assertEqual(result['mode'],'live')
            status,result=self.api('/api/assistant/question',{'question':'Qual telefone da administração?'})
            self.assertEqual(result['mode'],'live');self.assertIn('não está disponível',result['answer'])
            self.assertIn('A informar',json.dumps(captured[-1]))
            self.assertEqual(self.api('/api/assistant/question',{'question':'iluminação'},server.ADMIN)[0],403)
            self.assertEqual(self.api('/api/assistant/question',{'question':'iluminação'},'codigo-invalido')[0],401)
        self.assertEqual(len(captured),2)


class GeminiAdapter(unittest.TestCase):
    def sources(self):return [{'id':'F1','title':'Consulta fictícia','href':'#consulta/1','content':'Decisão publicada: melhorar iluminação.'}]
    def response(self,text,**overrides):
        return io.BytesIO(json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':text}]} }],**overrides}).encode())
    def test_gemini_contract_and_origin_without_exposing_key(self):
        import gemini_pr,assistente
        captured={}
        def respond(request,timeout):
            captured.update(json.loads(request.data))
            self.assertEqual(request.full_url,'https://generativelanguage.googleapis.com/v1beta/models/modelo-ficticio:generateContent')
            self.assertEqual(request.get_header('X-goog-api-key'),'chave-ficticia-pr')
            self.assertNotIn('chave-ficticia-pr',request.full_url);self.assertNotIn('chave-ficticia-pr',request.data.decode())
            self.assertEqual(timeout,12)
            return self.response('A decisão é melhorar a iluminação. [F1]')
        with patch.dict(os.environ,{'GEMINI_API_KEY':'chave-ficticia-pr','GEMINI_MODEL':'modelo-ficticio'}),patch('gemini_pr.urlopen',side_effect=respond):
            reply=assistente.responder_duvida('Qual a decisão?',self.sources())
        self.assertEqual(reply['mode'],'live');self.assertEqual(reply['provider'],'gemini');self.assertFalse(reply['unavailable'])
        self.assertIn('português',captured['systemInstruction']['parts'][0]['text'])
        self.assertEqual(captured['generationConfig']['maxOutputTokens'],2048);self.assertNotIn('tools',captured)
        context=json.loads(captured['contents'][0]['parts'][0]['text'])
        self.assertEqual(context['fontes'],self.sources())
        self.assertNotIn('residence_id',context)

    def test_failures_blocks_empty_outputs_unknown_citations_and_secret_echo_fall_back(self):
        import assistente
        broken=[b'not-json',json.dumps({'candidates':[]}).encode(),
                json.dumps({'promptFeedback':{'blockReason':'SAFETY'}}).encode(),
                json.dumps({'candidates':[{'finishReason':'MAX_TOKENS','content':{'parts':[{'text':'Parcial [F1]'}]}}]}).encode(),
                json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'thought':True,'text':'Somente pensamento [F1]'}]}}]}).encode()]
        with patch.dict(os.environ,{'GEMINI_API_KEY':'chave-ficticia-pr','GEMINI_MODEL':'modelo-ficticio'}):
            for raw in broken:
                with self.subTest(raw=raw),patch('gemini_pr.urlopen',return_value=io.BytesIO(raw)):
                    reply=assistente.responder_duvida('Qual a decisão?',self.sources());self.assertEqual(reply['mode'],'local');self.assertTrue(reply['unavailable'])
            for text in ['Dado inventado. [F999]','chave-ficticia-pr [F1]','Visite https://exemplo-inventado.test [F1]']:
                with self.subTest(text=text),patch('gemini_pr.urlopen',return_value=self.response(text)):
                    reply=assistente.responder_duvida('Qual a decisão?',self.sources());self.assertEqual(reply['mode'],'local');self.assertNotIn('chave-ficticia-pr',json.dumps(reply))
            for error in [TimeoutError(),IncompleteRead(b'{',10),RemoteDisconnected(),HTTPError('https://generativelanguage.googleapis.com',429,'rate limit',{},None)]:
                with patch('gemini_pr.urlopen',side_effect=error):
                    self.assertEqual(assistente.responder_duvida('Qual a decisão?',self.sources())['mode'],'local')

    def test_without_key_without_data_invalid_model_and_question_limits(self):
        import assistente
        with patch.dict(os.environ,{'GEMINI_API_KEY':'','GEMINI_MODEL':'modelo-ficticio'}),patch('gemini_pr.urlopen') as network:
            result=assistente.responder_duvida('Qual a decisão?',self.sources());self.assertEqual(result['mode'],'local');network.assert_not_called()
        with patch.dict(os.environ,{'GEMINI_API_KEY':'chave-ficticia-pr','GEMINI_MODEL':'modelo-ficticio'}),patch('gemini_pr.urlopen') as network:
            result=assistente.responder_duvida('Zorbax desconhecido',self.sources());self.assertIn('Não encontrei',result['answer']);network.assert_not_called()
        with patch.dict(os.environ,{'GEMINI_API_KEY':'chave-ficticia-pr','GEMINI_MODEL':'../../outro?key=valor'}),patch('gemini_pr.urlopen') as network:
            self.assertEqual(assistente.responder_duvida('Qual a decisão?',self.sources())['mode'],'local');network.assert_not_called()
        for invalid in ['', ' '*4, 'x'*1501, None]:
            with self.assertRaises(ValueError):assistente.responder_duvida(invalid,self.sources())
