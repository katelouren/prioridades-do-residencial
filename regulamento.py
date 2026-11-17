"""Documento único da demo e recuperação determinística por assunto/artigo."""
import json
import re
import unicodedata
from pathlib import Path

DOCUMENT_PATH = Path(__file__).resolve().parent / 'data' / 'regulamento.json'


def documento():
    # Sem cache: mudar a versão e o conteúdo atualiza leitura e busca juntas.
    return json.loads(DOCUMENT_PATH.read_text(encoding='utf-8'))


def normalizar(text):
    return ''.join(c for c in unicodedata.normalize('NFKD',text.casefold()) if not unicodedata.combining(c))


def fontes():
    doc = documento()
    result = []
    for article in doc['articles']:
        number = article['number']
        label = f'{number}º' if number < 10 else str(number)
        reference = f'{doc["title"]}, v{doc["version"]}, art. {label}'
        result.append({
            'kind': 'regulation', 'article': number, 'document_code': doc['code'],
            'version': doc['version'], 'date': doc['date'], 'reference': reference,
            'title': reference + ' — ' + article['title'],
            'href': f'#regras/artigo/{number}',
            'content': f'{doc["code"]} · {reference} · {doc["date"]}\n{doc["notice"]}\n{article["title"]}. {article["text"]}',
            'text': article['text'],
        })
    return result


def recuperar(question):
    """Retorna números de artigos, ausência/ambiguidade, ou None para outros registros.

    Não escolhe artigo por simples proximidade de palavras: preço não é prazo,
    salão não é academia. Assuntos não cobertos recebem ausência explícita.
    """
    q = normalizar(question)
    has = lambda pattern: bool(re.search(pattern,q))
    article = re.search(r'\b(?:art(?:igo)?\.?)[ ]*(\d+)(?:o)?\b',q)
    if article:
        return {'articles': [int(article[1])]}
    hall = has(r'\bsalao\b|\bfestas?\b')
    gym = has(r'\bacademia\b')
    cleaning = has(r'limp|higien|suj')
    # Contatos já estão no catálogo do portal; não substituir por regra geral.
    if has(r'contato|telefone|canal|email|e-mail'):
        return None
    if has(r'animais|cachorro|piscina|churrasqueira|barulho|multa') or ((hall or gym or has(r'regulamento|regimento|reserv')) and has(r'cust[ao]|prec[oç]|valor|taxa|pagar|pagamento|gratuit')):
        return {'missing': True}
    if has(r'horario|funcionamento|que horas|ate que hora|abre|abertura|fecha'):
        if not hall and not gym:
            return {'clarify': 'Você quer saber o horário do salão de festas ou da academia?'}
        return {'articles': ([3] if hall else []) + ([5] if gym else [])}
    if hall and has(r'reserv|antecedencia|tempo antes'):
        return {'articles': [4]}
    if has(r'acompanhar|acompanhamento|prazo de execucao') and has(r'chamado|protocolo|pedido|solicitac'):
        return {'articles': [9]}
    if has(r'confirm|protocolo') and has(r'chamado|pedido|solicitac|limp'):
        return {'articles': [8]}
    if cleaning and has(r'peco|pedir|pedido|solicitar|solicitac|registr|abrir|chamado'):
        return {'articles': [7]}
    if has(r'votar|voto|participar|participacao|participacoes|responder') and has(r'consulta|votar|voto'):
        return {'articles': [10]}
    if has(r'encerrar|encerramento|encerrada|publica|funciona') and has(r'devolutiva|consulta|retorno'):
        return {'articles': [11]}
    if has(r'duvida|orientac'):
        return {'articles': [12]}
    if has(r'convidado|responsabilidade') and not has(r'horario|hora|reserv'):
        return {'articles': [2]}
    if has(r'recolher|lixo|pertences|entrega|terminar|organizado'):
        return {'articles': [6]}
    if gym:
        return {'articles': [5]}
    if has(r'objetivo|finalidade'):
        return {'articles': [1]}
    if hall or has(r'reserv|horario|regulamento|regimento|regras'):
        return {'clarify': 'Sobre qual regra você quer saber: uso de áreas comuns, reservas, limpeza ou participação nas consultas?'}
    return None
