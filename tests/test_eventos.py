"""Eventos: intenção, fonte compartilhada e configuração sem exposição de chave."""
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import test_assistente as existing


class EventsFlow(unittest.TestCase):
    setUp=existing.AssistantFlow.setUp
    tearDown=existing.AssistantFlow.tearDown
    api=existing.AssistantFlow.api

    def ask(self,question):
        status,result=self.api('/api/assistant/question',{'question':question})
        self.assertEqual(status,200)
        return result

    def test_channels_are_shared_and_owner_questions_choose_only_events(self):
        self.assertEqual(self.api('/api/channels',code='invalid')[0],401)
        status,channels=self.api('/api/channels')
        self.assertEqual(status,200)
        events=next(row for row in channels['channels'] if row['id']=='eventos')
        self.assertEqual(events['owners'],['Administração','Diretoria Social'])
        self.assertEqual(events['contact'],'A informar')
        for question in ['Quem cuida dos eventos?','Com quem eu falo sobre festas?','Quem é responsável pelos eventos?']:
            with self.subTest(question=question):
                reply=self.ask(question)
                self.assertEqual(reply['mode'],'local')
                self.assertTrue(reply['answer'].startswith('Administração e Diretoria Social'))
                self.assertEqual(len(reply['sources']),1)
                self.assertEqual(reply['sources'][0]['kind'],'channel')
                self.assertEqual(reply['sources'][0]['channel_id'],'eventos')
                self.assertEqual(reply['sources'][0]['href'],'#regras')
                self.assertNotIn('Associação',json.dumps(reply,ensure_ascii=False))
                self.assertNotIn('Conselho',reply['answer'])
                self.assertNotIn('organiza',reply['answer'])

    def test_decision_and_rule_use_correct_source_without_channel_noise(self):
        reply=self.ask('O que a gestão decidiu sobre o evento?')
        self.assertEqual([s['href'] for s in reply['sources']],['#consulta/1'])
        self.assertIn('ainda não foi publicada',reply['answer'])
        self.assertEqual(self.ask('Até que horas posso usar o salão?')['sources'][0]['article'],3)
        with existing.closing(existing.server.connect()) as db,db:
            db.execute("UPDATE surveys SET response='Encontro cultural aprovado.',next_step='Publicar a programação.' WHERE id=1")
        reply=self.ask('O que a gestão decidiu sobre o evento?')
        self.assertTrue(reply['answer'].startswith('Encontro cultural aprovado.'))
        self.assertEqual(len(reply['sources']),1)
        # Uma segunda consulta sobre eventos exige esclarecer, sem escolher arbitrariamente.
        with existing.closing(existing.server.connect()) as db,db:
            db.execute('UPDATE surveys SET closed=1 WHERE id=2')
        reply=self.ask('O que a gestão decidiu sobre o evento?')
        self.assertTrue(reply['clarification'])
        self.assertNotIn('Encontro cultural aprovado.',reply['answer'])

    def test_missing_event_decision_does_not_fall_back_to_generic_sources(self):
        with existing.closing(existing.server.connect()) as db,db:
            db.execute("UPDATE surveys SET title='Consulta sobre melhorias' WHERE id IN (1,2)")
        with patch('assistente.redigir_resposta',return_value=None) as model:
            reply=self.ask('O que a gestão decidiu sobre o evento?')
            self.assertIn('Não encontrei devolutiva',reply['answer'])
            self.assertEqual(len(reply['sources']),1)
            self.assertEqual(reply['sources'][0]['channel_id'],'eventos')
            self.assertNotIn('Conselho',json.dumps(reply,ensure_ascii=False))
            model.assert_not_called()

    def test_gemini_gets_only_relevant_channel_and_falls_back_on_failure(self):
        seen=[]
        def respond(request,timeout):
            body=json.loads(request.data);context=json.loads(body['contents'][0]['parts'][0]['text']);seen.append(context)
            self.assertEqual(len(context['fontes']),1)
            source=context['fontes'][0]
            self.assertEqual(source['channel_id'],'eventos')
            self.assertNotIn('Conselho',json.dumps(context,ensure_ascii=False))
            self.assertNotIn('residence_id',json.dumps(context))
            self.assertIn('primeira frase',body['systemInstruction']['parts'][0]['text'])
            return io.BytesIO(json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'Administração e Diretoria Social são as áreas responsáveis por Eventos. ['+source['id']+']'}]}}]}).encode())
        with patch.dict(os.environ,{'GEMINI_API_KEY':'chave-ficticia-pr','GEMINI_MODEL':'modelo-ficticio'}):
            with patch('gemini_pr.urlopen',side_effect=respond):
                reply=self.ask('Quem cuida dos eventos?')
                self.assertEqual(reply['mode'],'live');self.assertFalse(reply['unavailable'])
            with patch('gemini_pr.urlopen',side_effect=TimeoutError()):
                reply=self.ask('Com quem eu falo sobre festas?')
                self.assertEqual(reply['mode'],'local');self.assertTrue(reply['unavailable'])
                self.assertTrue(reply['answer'].startswith('Administração e Diretoria Social'))
        self.assertEqual(len(seen),1)


class LocalEnvironment(unittest.TestCase):
    def test_only_pr_gemini_values_are_loaded_and_process_takes_precedence(self):
        from configuracao import carregar_gemini
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'.env'
            path.write_text('GEMINI_API_KEY="chave-ficticia-arquivo"\nexport GEMINI_MODEL=modelo-ficticio\nRESIDENCIAL_ADMIN=nao-alterar\n',encoding='utf-8')
            with patch.dict(os.environ,{},clear=True):
                carregar_gemini(path)
                self.assertEqual(os.environ['GEMINI_MODEL'],'modelo-ficticio')
                self.assertNotIn('RESIDENCIAL_ADMIN',os.environ)
                self.assertEqual(os.environ['GEMINI_API_KEY'],'chave-ficticia-arquivo')
            with patch.dict(os.environ,{'GEMINI_API_KEY':'','GEMINI_MODEL':'modelo-processo'},clear=True):
                carregar_gemini(path)
                self.assertEqual(os.environ['GEMINI_API_KEY'],'')
                self.assertEqual(os.environ['GEMINI_MODEL'],'modelo-processo')
