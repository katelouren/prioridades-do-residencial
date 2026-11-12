"""Assistente do morador: fontes permitidas, IA opcional e confirmação de chamados."""
import re
import secrets
import unicodedata
from gemini_pr import redigir_resposta
from encaminhamento import identificar_equipe
from solicitacoes import criar_solicitacao, listar_solicitacoes


def criar_tabelas(db):
    # Apenas um rascunho vinculado à residência; a OS só existe após confirmar.
    db.execute('''CREATE TABLE IF NOT EXISTS assistant_drafts (
        token TEXT PRIMARY KEY,
        residence_id INTEGER NOT NULL REFERENCES residences(id),
        local TEXT NOT NULL,
        description TEXT NOT NULL,
        request_id INTEGER UNIQUE REFERENCES service_requests(id),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )''')


def _texto(value, label, vazio=False):
    if not isinstance(value, str) or len(value.strip()) > 1500 or (not vazio and not value.strip()):
        raise ValueError(f'Informe {label} com até 1500 caracteres.')
    return value.strip()


def _normalizar(value):
    return ''.join(c for c in unicodedata.normalize('NFKD',value.casefold()) if not unicodedata.combining(c))


def preparar_limpeza(db, residence_id, data):
    mensagem=_texto(data.get('message',''),'a mensagem',vazio=True)
    local=_texto(data['local'],'o local',vazio=True) if 'local' in data else ('Academia' if re.search(r'\bacademia\b',_normalizar(mensagem)) else '')
    descricao=_texto(data['description'],'a descrição',vazio=True) if 'description' in data else mensagem
    if 'description' not in data and set(re.findall(r'\w+',_normalizar(mensagem))) <= {'academia','na','a','da','de','do','local','em','o'}:
        descricao=''
    missing=[]
    if not local:missing.append('local')
    if not descricao:missing.append('description')
    if local and identificar_equipe(local,'Higiene') is None:
        raise ValueError('Nesta etapa, a limpeza disponível é a da Academia. Confira o local.')
    if missing:
        return {'ready':False,'missing':missing,'message':'Informe '+('o local (nesta etapa, Academia)' if 'local' in missing else 'o que precisa ser limpo')+'. Nenhum chamado foi registrado.'}
    token=secrets.token_urlsafe(24)
    db.execute('INSERT INTO assistant_drafts(token,residence_id,local,description) VALUES(?,?,?,?)',(token,residence_id,'Academia',descricao))
    return {'ready':True,'token':token,'summary':{'local':'Academia','description':descricao,'team':identificar_equipe(local,'Higiene')}}


def confirmar_limpeza(db, residence_id, data):
    token=_texto(data.get('token'),'o resumo a confirmar')
    draft=db.execute('SELECT * FROM assistant_drafts WHERE token=? AND residence_id=?',(token,residence_id)).fetchone()
    if draft is None:raise LookupError()
    # BEGIN IMMEDIATE no servidor serializa confirmações concorrentes do token.
    if draft['request_id'] is not None:
        row=db.execute('SELECT protocol FROM service_requests WHERE id=?',(draft['request_id'],)).fetchone()
        return listar_solicitacoes(db,residence_id,row['protocol'])[0]
    local=_texto(data.get('local',draft['local']),'o local')
    descricao=_texto(data.get('description',draft['description']),'a descrição')
    request=criar_solicitacao(db,residence_id,local,'Higiene',descricao)
    db.execute('''UPDATE assistant_drafts SET request_id=(SELECT id FROM service_requests WHERE protocol=?),local=?,description=?
                  WHERE token=? AND residence_id=?''',(request['protocol'],'Academia',descricao,token,residence_id))
    return request


def fontes_publicadas(surveys):
    """Somente dados públicos do portal autenticado; sem convites, votos individuais ou fila."""
    sources=[]
    for survey in surveys:
        parts=[survey['title'],survey['description'],'Consulta '+('encerrada' if survey['closed'] else 'aberta')]
        if survey['closed']:
            parts += ['Decisão: '+(survey.get('response') or 'Aguardando devolutiva'),
                      'Próximo passo: '+(survey.get('next_step') or 'A informar'),
                      'Área responsável: '+(survey.get('responsible') or 'A informar'),
                      'Próximo retorno: '+(survey.get('next_update') or 'A informar'),
                      'Conclusão: '+(survey.get('completion') or 'A definir')]
            if 'count' in survey:parts.append('Participações: '+str(survey['count']))
        parts += ['Prazo de participação: '+(survey.get('deadline') or 'A informar'),
                  'Custo aproximado: '+(survey.get('cost') or 'A informar'),
                  'Impactos: '+(survey.get('impacts') or 'A informar')]
        for i,question in enumerate(survey['questions']):
            options=question['options']
            if survey['closed'] and 'totals' in survey:
                options=[f'{option}: {survey["totals"][i][j]}' for j,option in enumerate(options)]
            parts.append(question['label']+' '+('; '.join(options)))
        sources.append({'title':survey['title'],'href':f'#consulta/{survey["id"]}','content':'\n'.join(parts)[:6000]})
    # Mesmo catálogo e estados já exibidos por resources() no portal. Sem inventar documentos.
    sources += [
        {'title':'Canais por assunto','href':'#regras','content':'Limpeza e manutenção: Administração. Eventos e atividades: Associação. Acompanhamento e prestação de contas: Conselho. Todos os contatos: A informar. Residencial fictício.'},
        {'title':'Documentos do residencial','href':'#regras','content':'Convenção do residencial, Regimento interno, Calendário e regras de eventos: Aguardando publicação. Fonte/link: Aguardando publicação. Data da versão: A informar.'},
        {'title':'Legislação e orientações gerais','href':'#regras','content':'Referências oficiais disponíveis: Código Civil, Lei nº 10.406/2002, versão 10/01/2002; LGPD, Lei nº 13.709/2018, versão 14/08/2018. Fonte: Câmara dos Deputados. Referências conferidas em 10/11/2026. O conteúdo integral está nos links oficiais da tela Regras e contatos; não foi importado para o assistente.'}
    ]
    return [dict(source,id=f'F{i+1}') for i,source in enumerate(sources)]


def _fontes_relevantes(question,sources):
    stop={'qual','quais','como','quem','onde','quando','para','sobre','uma','que','esta','esse','essa','dos','das','com','por','tem','sao','foi'}
    terms={w for w in re.findall(r'\w+',_normalizar(question)) if len(w)>2 and w not in stop}
    ranked=[]
    for source in sources:
        title=_normalizar(source['title']);content=_normalizar(source['content'])
        score=sum(3*(word in title)+(word in content) for word in terms)
        if score:ranked.append((score,source))
    ranked.sort(key=lambda pair:pair[0],reverse=True)
    return [item[1] for item in ranked[:5]]


def responder_duvida(question,sources):
    question=_texto(question,'a dúvida')
    selected=_fontes_relevantes(question,sources)
    if not selected:
        return {'provider':'gemini','mode':'local','unavailable':True,'answer':'Não encontrei informação publicada sobre essa dúvida. Consulte Regras e contatos para verificar os canais disponíveis.',
                'sources':[source for source in sources if source['href']=='#regras']}
    text=redigir_resposta(question,selected)
    if text:return {'provider':'gemini','mode':'live','unavailable':False,'answer':text,'sources':selected}
    return {'provider':'gemini','mode':'local','unavailable':True,'answer':'A IA está indisponível para redigir a resposta. Confira as fontes publicadas abaixo. Quando um dado aparece como A informar ou Aguardando publicação, a gestão ainda não o disponibilizou. O registro de chamados continua funcionando.',
            'sources':selected}
