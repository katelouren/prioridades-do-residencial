"""Solicitações privadas e sua ordem de limpeza: regra simples, sem serviços externos.

As funções de escrita usam a conexão recebida e não fazem commit. Handler.api
controla a transação: ou todas as gravações são confirmadas, ou nenhuma é.
"""
import secrets
from encaminhamento import identificar_equipe


def criar_tabelas(db):
    """Migração aditiva dentro da transação de inicialização do servidor."""
    db.execute("""CREATE TABLE IF NOT EXISTS service_requests (
        id INTEGER PRIMARY KEY,
        protocol TEXT NOT NULL UNIQUE,
        residence_id INTEGER NOT NULL REFERENCES residences(id),
        local TEXT NOT NULL CHECK(local='Academia'),
        category TEXT NOT NULL CHECK(category='Higiene'),
        description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 1500),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS work_orders (
        id INTEGER PRIMARY KEY,
        request_id INTEGER NOT NULL UNIQUE REFERENCES service_requests(id),
        team TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pendente' CHECK(status IN ('Pendente','Concluída')),
        feedback TEXT NOT NULL DEFAULT '',
        completed_at TEXT,
        CHECK ((status='Pendente' AND feedback='' AND completed_at IS NULL)
            OR (status='Concluída' AND length(trim(feedback)) BETWEEN 1 AND 1500
                AND completed_at IS NOT NULL))
    )""")
    db.execute('CREATE INDEX IF NOT EXISTS requests_by_residence ON service_requests(residence_id,created_at)')


def _texto(value, label):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 1500:
        raise ValueError(f'Informe {label} com 1 a 1500 caracteres.')
    return value.strip()


def criar_solicitacao(db, residence_id, local, categoria, descricao):
    """Gatilho: solicitação válida gera solicitação + OS na transação do chamador."""
    if not isinstance(local, str) or not isinstance(categoria, str):
        raise ValueError('Informe o local Academia e a categoria Higiene.')
    equipe = identificar_equipe(local, categoria)
    if equipe is None:
        raise ValueError('Nesta etapa, só é possível solicitar higiene da academia.')
    descricao = _texto(descricao, 'a descrição')
    protocolo = 'SOL-' + secrets.token_hex(6).upper()
    request = db.execute('''INSERT INTO service_requests(protocol,residence_id,local,category,description)
                            VALUES(?,?,?,?,?)''',
                         (protocolo, residence_id, 'Academia', 'Higiene', descricao))
    # Se este INSERT falhar, o primeiro também é revertido por Handler.api.
    db.execute('INSERT INTO work_orders(request_id,team) VALUES(?,?)',
               (request.lastrowid, equipe))
    return listar_solicitacoes(db, residence_id, protocolo)[0]


_SELECT = '''SELECT r.protocol,r.local,r.category,r.description,r.created_at,
                    w.team,w.status,w.feedback,w.completed_at
             FROM service_requests r JOIN work_orders w ON w.request_id=r.id'''


def listar_solicitacoes(db, residence_id, protocolo=None):
    """O filtro por residência faz parte da consulta SQL, inclusive no detalhe."""
    query = _SELECT + ' WHERE r.residence_id=?'
    params = [residence_id]
    if protocolo is not None:
        query += ' AND r.protocol=?'
        params.append(protocolo)
    return [dict(row) for row in db.execute(query + ' ORDER BY r.created_at DESC,r.id DESC', params)]


def listar_fila_limpeza(db, protocolo=None):
    """Disponível apenas depois da verificação de perfil da gestão no servidor."""
    query = _SELECT
    params = []
    if protocolo is not None:
        query += ' WHERE r.protocol=?'
        params.append(protocolo)
    return [dict(row) for row in db.execute(query + " ORDER BY (w.status='Pendente') DESC,r.created_at DESC,r.id DESC", params)]


def concluir_ordem(db, protocolo, devolutiva):
    """Status, devolutiva e data são gravados juntos, sem estados intermediários."""
    devolutiva = _texto(devolutiva, 'a devolutiva')
    order = listar_fila_limpeza(db, protocolo)
    if not order:
        raise LookupError()
    if order[0]['status'] != 'Pendente':
        raise ValueError('Esta ordem já foi concluída. A devolutiva foi preservada.')
    db.execute('''UPDATE work_orders SET status='Concluída',feedback=?,
                  completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                  WHERE request_id=(SELECT id FROM service_requests WHERE protocol=?)''',
               (devolutiva, protocolo))
    return listar_fila_limpeza(db, protocolo)[0]
