"""Demonstração GS2 local e fictícia, em arquivo separado das bases anteriores."""
import json
import os
from pathlib import Path
import runpy
from configuracao import carregar_gemini
from contextlib import closing
from datetime import date, timedelta

carregar_gemini()

root = Path(__file__).resolve().parent
os.environ.setdefault('RESIDENCIAL_DB', str(root / 'demo-gs2.sqlite3'))
os.environ['RESIDENCIAL_ADMIN'] = 'demo-gestao'
os.environ['RESIDENCIAL_NOME'] = 'Residencial Horizonte'

from server import connect, digest, init, new_survey, issue_code


def seed():
    """Prepara apenas uma base vazia. Nunca remodela consultas já utilizadas."""
    init()
    with closing(connect()) as db, db:
        db.execute('BEGIN IMMEDIATE')
        if db.execute('SELECT 1 FROM surveys LIMIT 1').fetchone():
            return
        for n in (1, 2):
            identifier = f'DEMO-{n:02}'
            if not db.execute('SELECT 1 FROM residences WHERE identifier=?', (identifier,)).fetchone():
                issue_code(db, identifier, f'demo-morador-{n}')
        today = date.today()
        calendar = new_survey(db, {
            'title':'Calendário anual de eventos',
            'description':'A associação consultou as residências sobre a prioridade para o calendário anual. As preferências orientarão a proposta de atividades. Exemplo com respostas fictícias.',
            'deadline':(today-timedelta(days=3)).isoformat(),
            'cost':'A informar',
            'impacts':'Uso de áreas comuns e circulação de convidados, conforme o evento escolhido.',
            'questions':[{'label':'Qual evento você priorizaria?', 'options':['Encontro cultural','Atividades esportivas','Festa temática','Não realizar eventos','Sem preferência']}]
        })
        new_survey(db, {
            'title':'Formato e decoração de um evento',
            'description':'Queremos ouvir as residências sobre um possível encontro temático no salão. As respostas orientarão a decisão da gestão sobre a realização e o formato do evento.',
            'deadline':(today+timedelta(days=30)).isoformat(),
            'cost':'Estimativa demonstrativa de R$ 800, sujeita à avaliação da gestão.',
            'impacts':'Possível uso do salão até as 21h e decoração temporária nas áreas escolhidas.',
            'questions':[
                {'label':'Qual sua preferência sobre realizar o evento?', 'options':['Realizar','Não realizar','Sem preferência']},
                {'label':'Se acontecer, onde prefere a decoração?', 'options':['Somente no espaço do evento','Também nas áreas comuns sinalizadas','Sem decoração temática','Sem preferência']},
                {'label':'Se houver decoração, por quanto tempo?', 'options':['Somente no dia do evento','Até três dias','Até uma semana','Sem preferência','Não se aplica']}
            ]
        })
        improvements = new_survey(db, {
            'title':'Melhorias da área comum',
            'description':'As residências indicaram uma prioridade para melhorar os espaços compartilhados. A gestão avaliou as preferências e publicou o encaminhamento. Dados fictícios.',
            'deadline':(today-timedelta(days=10)).isoformat(),
            'cost':'Orçamentos ainda serão solicitados.',
            'impacts':'Os serviços serão agendados para reduzir interrupções no uso das áreas comuns.',
            'questions':[{'label':'Qual melhoria você priorizaria?', 'options':['Iluminação dos caminhos','Limpeza da academia','Manutenção dos bancos','Sem preferência']}]
        })
        db.execute('UPDATE surveys SET closed=1 WHERE id IN (?,?)', (calendar, improvements))
        db.execute('UPDATE surveys SET response=?,next_step=?,subject_status=?,responsible=?,next_update=?,completion=? WHERE id=?',
                   ('Priorizar a melhoria da iluminação dos caminhos.',
                    'Solicitar três propostas e apresentar a comparação ao conselho.',
                    'Em andamento','Administração',(today+timedelta(days=7)).isoformat(),'',improvements))
        for sid, answers in [(calendar, [[0],[1]]), (improvements, [[0],[0]])]:
            for n, choices in enumerate(answers,1):
                invite = db.execute('SELECT code_hash,residence_id FROM invites WHERE residence_id=(SELECT id FROM residences WHERE identifier=?) AND active=1',(f'DEMO-{n:02}',)).fetchone()
                db.execute('INSERT INTO votes(survey,invite,choices,residence_id) VALUES(?,?,?,?)',
                           (sid,invite['code_hash'],json.dumps(choices),invite['residence_id']))


if __name__ == '__main__':
    seed()
    print('Demonstração fictícia GS2. Acessos iniciais: demo-morador-1, demo-morador-2 e demo-gestao. Códigos substituídos não são reativados.', flush=True)
    runpy.run_path(str(root / 'server.py'), run_name='__main__')
