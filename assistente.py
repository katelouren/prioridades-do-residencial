"""Assistente do morador: fontes permitidas, IA opcional e confirmação de chamados."""
import re
import secrets
import unicodedata
from regulamento import fontes as fontes_regulamento, recuperar as recuperar_artigos
from gemini_pr import redigir_resposta
from canais import catalogo as catalogo_canais, fonte as fonte_canais, fonte_assunto
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
        sources.append({'kind':'survey','closed':bool(survey['closed']),'title':survey['title'],'href':f'#consulta/{survey["id"]}','content':'\n'.join(parts)[:6000]})
    # Mesmo catálogo e estados já exibidos por resources() no portal. Sem inventar documentos.
    sources += [
        fonte_canais(),
        {'title':'Documentos do residencial','href':'#regras','content':'Convenção do residencial e Calendário e regras de eventos: Aguardando publicação. Fonte/link: Aguardando publicação. Data da versão: A informar.'},
        {'title':'Legislação e orientações gerais','href':'#regras','content':'Referências oficiais disponíveis: Código Civil, Lei nº 10.406/2002, versão 10/01/2002; LGPD, Lei nº 13.709/2018, versão 14/08/2018. Fonte: Câmara dos Deputados. Referências conferidas em 10/11/2026. O conteúdo integral está nos links oficiais da tela Regras e contatos; não foi importado para o assistente.'}
    ]
    sources += fontes_regulamento()
    return [dict(source,id=f'F{i+1}') for i,source in enumerate(sources)]


def _fontes_relevantes(question,sources):
    stop={'qual','quais','como','quem','onde','quando','para','sobre','uma','que','esta','esse','essa','dos','das','com','por','tem','sao','foi','gestao'}
    terms={w for w in re.findall(r'\w+',_normalizar(question)) if len(w)>2 and w not in stop}
    ranked=[]
    for source in sources:
        title=_normalizar(source['title']);content=_normalizar(source['content'])
        score=sum(3*(word in title)+(word in content) for word in terms)
        if score:ranked.append((score,source))
    ranked.sort(key=lambda pair:pair[0],reverse=True)
    return [item[1] for item in ranked[:5]]


def _local(answer, sources=(), **extra):
    return {'provider':'gemini','mode':'local','unavailable':False,
            'answer':answer,'sources':list(sources),**extra}


def intencao_limpeza(question):
    q=_normalizar(question)
    # Orientação e perguntas de confirmação jamais acionam a prévia de ação.
    if '?' in q or re.search(r'^\s*(como|qual|quais|onde|quando|quem|o que|por que|quanto|posso|pode|podemos|tenho que|e obrigatorio|preciso confirmar|devo confirmar|e preciso)\b',q):
        return False
    if re.search(r'\bnao (?:quero|precisa|precisam|solicite|solicitar)|cancelar|cancele',q):
        return False
    return bool(re.search(r'limp|suj|higien',q) and re.search(
        r'precisa|precisando|esta suj|estao suj|solicito|quero|gostaria|solicitar|pedir|limpar|\bsuja?\b|\bsujos?\b',q))


def responder_status(db, residence_id, question):
    """Consulta privada somente por residência. Nunca é enviada ao Gemini."""
    q=_normalizar(question)
    protocol=re.search(r'\bSOL-[A-F0-9]{12}\b',question,re.I)
    if not protocol and not (re.search(r'\b(?:meus?|minhas?)\b',q) and re.search(r'chamado|pedido|solicitac|protocolo',q)):
        return None
    if not protocol and re.search(r'como (?:peco|pedir|solicitar|abrir|registrar|confirmar|acompanhar)|preciso confirmar|devo confirmar',q):
        return None
    rows=listar_solicitacoes(db,residence_id,protocol[0].upper() if protocol else None)
    source={'id':'F1','title':'Minhas solicitações','href':'#solicitacoes','content':'Chamados da residência autenticada.'}
    if not rows:
        return _local('Esse chamado não foi encontrado para a sua residência.' if protocol else 'Nenhum chamado da sua residência foi encontrado.',[source])
    answer='\n'.join(f'{row["protocol"]}: {row["status"]}.'+(f' Retorno: {row["feedback"]}' if row['feedback'] else ' Ainda sem devolutiva.') for row in rows[:10])
    if len(rows)>10:answer+='\nConsulte todos os chamados em Minhas solicitações.'
    return _local(answer,[source])


def responder_duvida(question,sources):
    question=_texto(question,'a dúvida')
    if intencao_limpeza(question):
        return _local('Revise o local e a descrição antes de confirmar o chamado.',intent='cleaning')
    q=_normalizar(question)
    channels=[s for s in sources if s['title']=='Canais por assunto']
    portal=[s for s in sources if s.get('kind')!='regulation']
    events=bool(re.search(r'event|festa',q))
    owner_question=bool(re.search(r'quem|responsave|cuida|com quem|contato|canal|telefone|falo|falar',q))
    if events and owner_question and not re.search(r'decid|decisao|devolutiva',q):
        channel=next(row for row in catalogo_canais()['channels'] if row['id']=='eventos')
        selected=[fonte_assunto(channels[0],channel)]
        owners=' e '.join(channel['owners'])
        answer=owners+' são as áreas responsáveis por '+channel['subject']+'.'
        answer+=(' O contato ainda está A informar em Regras e contatos.' if channel['contact']=='A informar' else ' Contato publicado: '+channel['contact']+'.')
        text=redigir_resposta(question,selected)
        return ({'provider':'gemini','mode':'live','unavailable':False,'answer':text,'sources':selected}
                if text else _local(answer,selected,unavailable=True))
    opened=bool(re.search(r'consultas?.*(?:abert|ativ|disponiv)',q)) and not re.search(r'votar|participar|participacao|responder',q)
    decision=bool(re.search(r'decid|decisao|gestao.*(?:evento|iluminacao)|devolutiva.*(?:evento|iluminacao)',q))
    recovered=recuperar_artigos(question)
    # Tarifa do espaço não é orçamento de evento, mesmo com a palavra decisão.
    missing_tariff=bool(recovered and recovered.get('missing') and re.search(r'salao|reserv|academia',q) and re.search(r'cust|preco|taxa|valor|pagar|pagamento|gratuit',q))
    rule=recovered if missing_tariff or not (opened or decision) else None
    if rule:
        if rule.get('clarify'):
            return _local(rule['clarify'],clarification=True)
        selected=[s for s in sources if s.get('kind')=='regulation' and s['article'] in rule.get('articles',[])]
        if rule.get('missing') or not selected:
            return _local('O regulamento não traz essa informação. Confirme a orientação com a Administração em Regras e contatos; o contato ainda está A informar.',channels)
        answer='\n'.join(s['text']+' Fonte: '+s['reference']+'.' for s in selected)
        text=redigir_resposta(question,selected)
        if text:
            # Referência e link são sempre do servidor, mesmo na redação opcional.
            references='\n'.join('Fonte: '+s['reference']+'.' for s in selected)
            return {'provider':'gemini','mode':'live','unavailable':False,'answer':text+'\n'+references,'sources':selected}
        return _local(answer,selected,unavailable=True)
    if decision and channels:
        surveys=[source for source in portal if source.get('kind')=='survey' and source['closed']]
        if events:
            surveys=[source for source in surveys if re.search(r'event|festa',_normalizar(source['title']))]
        relevant=_fontes_relevantes(question,surveys)
        if len(relevant)>1:
            # Uma pergunta genérica não escolhe arbitrariamente entre devolutivas.
            if events and not re.search(r'calendario|decoracao|formato',q):
                return _local('Sobre qual consulta de evento você quer saber? '+', '.join(s['title'] for s in relevant)+'.',clarification=True)
        selected=relevant[:1]
        if selected:
            source=selected[0]
            lines=source['content'].splitlines()
            response=next((line.removeprefix('Decisão: ') for line in lines if line.startswith('Decisão: ')), 'Aguardando devolutiva')
            if response=='Aguardando devolutiva':
                answer='A devolutiva dessa consulta ainda não foi publicada: '+source['title']+'.'
            else:
                answer=response
                next_step=next((line.removeprefix('Próximo passo: ') for line in lines if line.startswith('Próximo passo: ')), '')
                if next_step and next_step!='A informar':answer+=' Próximo passo: '+next_step
            # Envia apenas devolutiva e identificação, sem votos/orçamentos/propostas.
            selected=[{**source,'content':source['title']+'\n'+answer}]
            text=redigir_resposta(question,selected)
            return ({'provider':'gemini','mode':'live','unavailable':False,'answer':text,'sources':selected}
                    if text else _local(answer,selected,unavailable=True))
        if events:
            channel=next(row for row in catalogo_canais()['channels'] if row['id']=='eventos')
            selected=[fonte_assunto(channels[0],channel)]
            return _local('Não encontrei devolutiva publicada sobre esse evento. Confirme com '+' e '.join(channel['owners'])+' no canal Eventos em Regras e contatos. Contato: '+channel['contact']+'.',selected)
        return _local('Não encontrei devolutiva publicada para esse assunto. Informe o nome da consulta para conferir o retorno correspondente.')
    if opened:
        selected=[s for s in portal if s.get('kind')=='survey' and not s['closed']]
        if not selected:return _local('Não há consultas abertas no momento.')
    else:
        pool=[s for s in portal if s.get('kind')!='survey' or s['closed']] if decision else portal
        selected=_fontes_relevantes(question,pool)
    if not selected:
        return _local('Não encontrei informação publicada sobre essa dúvida. Se for uma regra, o regulamento não traz essa informação. Confirme com a Administração em Regras e contatos.',channels)
    text=redigir_resposta(question,selected)
    if text:return {'provider':'gemini','mode':'live','unavailable':False,'answer':text,'sources':selected}
    # O modo local responde com fatos recuperados, sem depender da redação pela IA.
    parts=[]
    for source in selected[:3]:
        lines=source['content'].splitlines()
        if source.get('kind')=='survey':
            relevant=[line for line in lines if line.startswith(('Prazo de participação:',) if opened else ('Decisão:','Próximo passo:'))]
            parts.append(source['title']+': '+(' '.join(relevant) or lines[2]))
        else:
            parts.append(source['content'])
    return _local('\n\n'.join(parts)[:2000],selected,unavailable=True)
