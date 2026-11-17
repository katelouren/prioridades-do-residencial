"""Regulamento compartilhado, recuperação local, referências e autorização."""
import io
import json
import os
import unittest
from unittest.mock import patch
import test_assistente as existing


class RegulationFlow(unittest.TestCase):
    setUp = existing.AssistantFlow.setUp
    tearDown = existing.AssistantFlow.tearDown
    api = existing.AssistantFlow.api

    def ask(self, question, code='demo-morador-1'):
        status, result = self.api('/api/assistant/question', {'question': question}, code)
        self.assertEqual(status, 200)
        return result

    def test_document_is_authenticated_and_matches_cited_articles(self):
        self.assertEqual(self.api('/api/regulation',code='invalid')[0],401)
        for code in ['demo-morador-1', 'demo-morador-2', existing.server.ADMIN]:
            status, doc = self.api('/api/regulation', code=code)
            self.assertEqual(status,200)
            self.assertEqual(doc['code'],'RH-RI-001')
            self.assertEqual(doc['version'],'1.0')
            self.assertEqual(doc['date'],'2026-11-12')
            self.assertIn('fictício',doc['notice'])
            self.assertEqual([a['number'] for a in doc['articles']],list(range(1,13)))
        reply = self.ask('Até que horas posso ficar no salão de festas?')
        source = reply['sources'][0]
        self.assertEqual(source['article'],3)
        self.assertEqual(source['href'],'#regras/artigo/3')
        self.assertIn(doc['articles'][2]['text'],source['content'])
        self.assertIn('Regulamento Interno do Residencial Horizonte, v1.0, art. 3º',reply['answer'])

    def test_local_rules_accents_paraphrases_and_unknown_values(self):
        cases = [
            ('Até que horas posso ficar no salão de festas?',3,'22h'),
            ('Quanto tempo antes preciso reservar o salão?',4,'três dias corridos'),
            ('Que horas a academia abre?',5,'6h às 22h'),
            ('Qual o horario de funcionamento da academia?',5,'6h às 22h'),
            ('Qual o horário do SALAO DE FESTAS?',3,'9h às 22h'),
            ('Como peço limpeza?',7,'local'),
            ('Quantas vezes posso votar na consulta?',10,'uma participação'),
            ('O que acontece depois de encerrar uma consulta?',11,'Aguardando devolutiva'),
            ('O que diz o artigo 6?',6,'recolher o lixo'),
            ('O que diz o art. 3º?',3,'22h'),
            ('Como votar nas consultas abertas?',10,'uma participação'),
            ('Posso limpar os equipamentos da academia?',5,'higienizar'),
            ('É obrigatório limpar a academia?',5,'higienizar'),
        ]
        with patch('gemini_pr.urlopen') as network:
            for question, number, text in cases:
                with self.subTest(question=question):
                    reply=self.ask(question)
                    self.assertEqual(reply['mode'],'local')
                    self.assertIn(text,reply['answer'])
                    self.assertEqual([s['article'] for s in reply['sources']],[number])
            network.assert_not_called()
        with existing.closing(existing.server.connect()) as db,db:
            db.execute("UPDATE surveys SET closed=1,response='Evento aprovado com orçamento demonstrativo de R$ 800.' WHERE id=2")
        for question in ['Quanto custa reservar o salão?', 'Qual a multa por barulho?', 'Posso levar cachorro na piscina?', 'Já decidiram quanto custa reservar o salão de festas?']:
            reply=self.ask(question)
            self.assertIn('não',reply['answer'].lower())
            self.assertIn('Administração',reply['answer'])
            self.assertEqual(reply['sources'][0]['href'],'#regras')
            self.assertNotIn('800',json.dumps(reply))
        reply=self.ask('Qual o horário de funcionamento?')
        self.assertTrue(reply['clarification'])
        self.assertIn('academia',reply['answer'])
        self.assertNotIn('22h',reply['answer'])

    def test_document_version_is_shared_without_duplicate_content(self):
        from pathlib import Path
        import regulamento
        document=regulamento.documento()
        document['version']='1.1'
        document['articles'][2]['text']='Horário fictício atualizado: até as 20h.'
        path=Path(self.tmp.name)/'regulamento-test.json'
        path.write_text(json.dumps(document),encoding='utf-8')
        with patch('regulamento.DOCUMENT_PATH',path):
            self.assertEqual(self.api('/api/regulation')[1]['version'],'1.1')
            reply=self.ask('Até que horas posso ficar no salão de festas?')
            self.assertIn('20h',reply['answer']);self.assertIn('v1.1',reply['answer'])
            self.assertEqual(reply['sources'][0]['version'],'1.1')

    def test_instruction_is_not_action_and_only_confirmation_creates_one_order(self):
        for question in ['Como peço limpeza?','Como solicitar a limpeza da academia','Preciso confirmar o pedido de limpeza?', 'Qual o contato para limpeza?']:
            reply=self.ask(question)
            self.assertNotEqual(reply.get('intent'),'cleaning')
        reply=self.ask('A academia precisa de limpeza')
        self.assertEqual(reply['intent'],'cleaning')
        self.assertEqual(self.api('/api/requests')[1]['requests'],[])
        with existing.closing(existing.server.connect()) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM assistant_drafts').fetchone()[0],0)
        _,preview=self.api('/api/assistant/cleaning/preview',{'message':'A academia precisa de limpeza'})
        body={'token':preview['token'],'local':'Academia','description':'Limpar aparelhos fictícios'}
        first=self.api('/api/assistant/cleaning/confirm',body)[1]['request']
        second=self.api('/api/assistant/cleaning/confirm',body)[1]['request']
        self.assertEqual(first['protocol'],second['protocol'])
        self.assertEqual(len(self.api('/api/cleaning',code=existing.server.ADMIN)[1]['orders']),1)

    def test_status_uses_authenticated_residence_and_never_calls_gemini(self):
        _, created=self.api('/api/requests',{'local':'Academia','category':'Higiene','description':'Pedido privado fictício'})
        protocol=created['request']['protocol']
        with patch('assistente.redigir_resposta') as model:
            reply=self.ask('Qual o status do meu chamado '+protocol+'?')
            self.assertIn(protocol,reply['answer']);self.assertIn('Pendente',reply['answer'])
            other=self.ask('Qual o status do chamado '+protocol+'?',code='demo-morador-2')
            self.assertNotIn('Pedido privado fictício',json.dumps(other))
            self.assertNotIn('Pendente',other['answer'])
            self.assertIn('não',other['answer'].lower())
            self.assertEqual(other['sources'][0]['href'],'#solicitacoes')
            self.assertIn('Nenhum',self.ask('Como está meu chamado?',code='demo-morador-2')['answer'])
            model.assert_not_called()

    def test_gemini_receives_only_selected_article_and_failure_keeps_local_answer(self):
        captured=[]
        def respond(request,timeout):
            context=json.loads(json.loads(request.data)['contents'][0]['parts'][0]['text'])
            captured.append(context)
            return io.BytesIO(json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'O salão pode ser usado até as 22h. ['+context['fontes'][0]['id']+']'}]}}]}).encode())
        with patch.dict(os.environ,{'GEMINI_API_KEY':'chave-ficticia-teste','GEMINI_MODEL':'modelo-ficticio'}):
            with patch('gemini_pr.urlopen',side_effect=respond):
                reply=self.ask('Até que horas posso ficar no salão de festas?')
                self.assertEqual(reply['mode'],'live')
                self.assertEqual([s['article'] for s in captured[0]['fontes']],[3])
                self.assertIn('art. 3º',reply['answer'])
                self.assertNotIn('residence_id',json.dumps(captured))
                self.assertNotIn('800',json.dumps(captured))
            with patch('gemini_pr.urlopen',side_effect=TimeoutError()):
                reply=self.ask('Quanto tempo antes preciso reservar o salão?')
                self.assertEqual(reply['mode'],'local');self.assertTrue(reply['unavailable'])
                self.assertIn('três dias corridos',reply['answer'])
        opened=self.ask('Quais consultas estão abertas?')
        self.assertIn('Formato e decoração de um evento',opened['answer'])
        self.assertTrue(all(s['href']=='#consulta/2' for s in opened['sources']))
        decision=self.ask('O que foi decidido sobre iluminação?')
        self.assertIn('Priorizar a melhoria da iluminação',decision['answer'])
        self.assertEqual(decision['sources'][0]['href'],'#consulta/3')
