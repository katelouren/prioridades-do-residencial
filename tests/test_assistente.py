"""Assistente: confirmação humana, idempotência, fontes permitidas e fallback."""
import io
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
        self.env=patch.dict(os.environ,{'OPENAI_API_KEY':'','OPENAI_MODEL':''});self.env.start()
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
        self.assertEqual(status,200);self.assertEqual(reply['mode'],'links')
        self.assertTrue(any(s['href']=='#consulta/2' for s in reply['sources']))
        self.assertNotIn('SEGREDO_NAO_PUBLICADO',json.dumps(reply));self.assertNotIn('PRIVADO_OUTRA_RESIDENCIA',json.dumps(reply))
        status,reply=self.api('/api/assistant/question',{'question':'Decisão sobre iluminação'})
        self.assertTrue(any('iluminação' in s['content'] for s in reply['sources']))
        status,reply=self.api('/api/assistant/question',{'question':'contato para limpeza'})
        self.assertTrue(any(s['href']=='#regras' for s in reply['sources']))
        status,reply=self.api('/api/assistant/question',{'question':'Zorbax-731 desconhecido'})
        self.assertIn('Não encontrei',reply['answer'])
        self.assertEqual(self.api('/api/assistant/question',{'question':' '})[0],400)


class AIAdapter(unittest.TestCase):
    def sources(self):return [{'id':'F1','title':'Consulta fictícia','href':'#consulta/1','content':'Decisão publicada: melhorar iluminação.'}]
    def test_configured_ai_receives_bounded_sources_and_does_not_store_response(self):
        import assistente
        captured={}
        def respond(request,timeout):
            captured.update(json.loads(request.data));self.assertEqual(request.full_url,'https://api.openai.com/v1/responses')
            self.assertLessEqual(timeout,20)
            return io.BytesIO(json.dumps({'output':[{'type':'message','content':[{'type':'output_text','text':'A decisão é melhorar a iluminação. [F1]'}]}]}).encode())
        with patch.dict(os.environ,{'OPENAI_API_KEY':'chave-ficticia','OPENAI_MODEL':'modelo-configurado'}),patch('assistente.urlopen',side_effect=respond):
            reply=assistente.responder_duvida('Qual a decisão?',self.sources())
        self.assertEqual(reply['mode'],'ai');self.assertIn('[F1]',reply['answer'])
        self.assertFalse(captured['store']);self.assertEqual(captured['model'],'modelo-configurado');self.assertNotIn('tools',captured)
        self.assertIn('melhorar iluminação',captured['input'])
    def test_ai_failure_or_unknown_citation_falls_back_to_sources(self):
        import assistente
        with patch.dict(os.environ,{'OPENAI_API_KEY':'chave-ficticia','OPENAI_MODEL':'modelo-configurado'}):
            with patch('assistente.urlopen',side_effect=TimeoutError()):
                reply=assistente.responder_duvida('Qual a decisão?',self.sources());self.assertEqual(reply['mode'],'links')
            with patch('assistente.urlopen',return_value=io.BytesIO(json.dumps({'output':[{'type':'message','content':[{'type':'output_text','text':'Dado inventado. [F999]'}]}]}).encode())):
                reply=assistente.responder_duvida('Qual a decisão?',self.sources());self.assertEqual(reply['mode'],'links');self.assertNotIn('inventado',reply['answer'])
