"""Servidor local de avaliação do Prioridades do Residencial."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
from datetime import date
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from solicitacoes import criar_tabelas, criar_solicitacao, listar_solicitacoes, listar_fila_limpeza, concluir_ordem
from assistente import criar_tabelas as criar_tabelas_assistente, preparar_limpeza, confirmar_limpeza, fontes_publicadas, responder_duvida, responder_status, _texto
from regulamento import documento as documento_regulamento
from canais import catalogo as catalogo_canais
from configuracao import carregar_gemini

carregar_gemini()

ROOT = Path(__file__).resolve().parent
DATABASE = os.environ.get("RESIDENCIAL_DB", str(ROOT / "residencial.sqlite3"))
ADMIN = os.environ.get("RESIDENCIAL_ADMIN") or secrets.token_urlsafe(24)
NAME = os.environ.get("RESIDENCIAL_NOME", "Residencial demonstração")


def digest(code):
    return hashlib.sha256(code.encode()).hexdigest()


def connect():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init():
    with closing(connect()) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS invites (
                code_hash TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS surveys (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                questions TEXT NOT NULL,
                closed INTEGER NOT NULL DEFAULT 0,
                response TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS votes (
                survey INTEGER REFERENCES surveys(id),
                invite TEXT REFERENCES invites(code_hash),
                choices TEXT NOT NULL,
                PRIMARY KEY (survey, invite)
            );
        """)
        # Migração aditiva e transacional: os convites antigos viram residências
        # legadas independentes, pois não há como deduzir sua unidade original.
        with db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("CREATE TABLE IF NOT EXISTS residences (id INTEGER PRIMARY KEY, identifier TEXT NOT NULL UNIQUE)")
            additions = {
                "invites": [("residence_id", "INTEGER REFERENCES residences(id)"), ("active", "INTEGER NOT NULL DEFAULT 1")],
                "votes": [("residence_id", "INTEGER REFERENCES residences(id)")],
                "surveys": [(key, "TEXT NOT NULL DEFAULT ''") for key in
                            ("deadline", "cost", "impacts", "responsible", "next_update", "completion", "next_step")]
                            + [("subject_status", "TEXT NOT NULL DEFAULT 'Aguardando retorno'")]
            }
            for table, columns in additions.items():
                existing = {r[1] for r in db.execute(f"PRAGMA table_info({table})")}
                for name, definition in columns:
                    if name not in existing:
                        db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
            for row in db.execute("SELECT code_hash FROM invites WHERE residence_id IS NULL").fetchall():
                identifier = "Legado-" + row["code_hash"]
                db.execute("INSERT OR IGNORE INTO residences(identifier) VALUES(?)", (identifier,))
                db.execute("UPDATE invites SET residence_id=(SELECT id FROM residences WHERE identifier=?) WHERE code_hash=?",
                           (identifier, row["code_hash"]))
            db.execute("UPDATE votes SET residence_id=(SELECT residence_id FROM invites WHERE code_hash=votes.invite) WHERE residence_id IS NULL")
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS one_active_code ON invites(residence_id) WHERE active=1")
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS one_participation ON votes(survey,residence_id)")
            criar_tabelas(db)
            criar_tabelas_assistente(db)
            for table in ("invites", "votes"):
                for operation in ("INSERT", "UPDATE"):
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS {table}_residence_{operation} BEFORE {operation} ON {table} WHEN NEW.residence_id IS NULL BEGIN SELECT RAISE(ABORT, 'residence required'); END")


def issue_code(db, identifier, code=None):
    identifier = clean(identifier, 80)
    db.execute("INSERT OR IGNORE INTO residences(identifier) VALUES(?)", (identifier,))
    rid = db.execute("SELECT id FROM residences WHERE identifier=?", (identifier,)).fetchone()[0]
    db.execute("UPDATE invites SET active=0 WHERE residence_id=?", (rid,))
    code = code or secrets.token_urlsafe(18)
    db.execute("INSERT INTO invites(code_hash,residence_id,active) VALUES(?,?,1)", (digest(code), rid))
    return code


def optional(body, key, limit=200):
    value = body.get(key, "")
    if not isinstance(value, str) or len(value.strip()) > limit:
        raise ValueError(f"Confira o campo {key} (até {limit} caracteres).")
    return value.strip()


def date_field(body, key):
    value = optional(body, key, 10)
    if value:
        try:
            if date.fromisoformat(value).isoformat() != value:
                raise ValueError()
        except ValueError:
            raise ValueError("Informe uma data válida no formato AAAA-MM-DD.")
    return value



def clean(value, limit):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= limit:
        raise ValueError("Confira os campos obrigatórios e o tamanho do texto.")
    return value.strip()


def new_survey(db, body):
    title = clean(body.get("title"), 120)
    description = clean(body.get("description"), 1500)
    raw = body.get("questions")
    if not isinstance(raw, list) or not 1 <= len(raw) <= 6:
        raise ValueError("Inclua de uma a seis perguntas.")
    questions = []
    for q in raw:
        if not isinstance(q, dict):
            raise ValueError("Pergunta inválida.")
        label = clean(q.get("label"), 200)
        options = q.get("options")
        if not isinstance(options, list) or not 2 <= len(options) <= 6:
            raise ValueError("Inclua de duas a seis opções por pergunta.")
        options = [clean(option, 120) for option in options]
        if len(set(options)) != len(options):
            raise ValueError("As opções da pergunta precisam ser diferentes.")
        questions.append({"label": label, "options": options})
    cursor = db.execute("INSERT INTO surveys(title,description,questions,deadline,cost,impacts) VALUES(?,?,?,?,?,?)",
               (title, description, json.dumps(questions, ensure_ascii=False), date_field(body, "deadline"),
                optional(body, "cost"), optional(body, "impacts", 1500)))
    return cursor.lastrowid


def list_surveys(db, invite):
    surveys = []
    for row in db.execute("SELECT * FROM surveys ORDER BY closed, id DESC"):
        item = dict(row)
        questions = json.loads(item["questions"])
        item["questions"] = questions
        item["voted"] = bool(db.execute(
            "SELECT 1 FROM votes WHERE survey=? AND residence_id=(SELECT residence_id FROM invites WHERE code_hash=?)", (row["id"], invite)
        ).fetchone())
        if row["closed"]:
            totals = [[0] * len(q["options"]) for q in questions]
            count = 0
            for vote in db.execute("SELECT choices FROM votes WHERE survey=?", (row["id"],)):
                count += 1
                for index, choice in enumerate(json.loads(vote["choices"])):
                    totals[index][choice] += 1
            item.update(totals=totals, count=count)
        surveys.append(item)
    return surveys


class Handler(BaseHTTPRequestHandler):
    def send(self, status, data, content_type="application/json; charset=utf-8"):
        if isinstance(data, dict):
            data = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(data)

    def error(self, status, message):
        self.send(status, {"error": message})

    def do_GET(self):
        path = urlsplit(self.path).path
        assets = {
            "/": ("index.html", "text/html"),
            "/app.js": ("app.js", "text/javascript"),
            "/style.css": ("style.css", "text/css"),
            "/assistant.js": ("assistant.js", "text/javascript"),
            "/assistant.css": ("assistant.css", "text/css"),
        }
        if path in assets:
            name, mime = assets[path]
            self.send(200, (ROOT / "public" / name).read_bytes(), mime + "; charset=utf-8")
        else:
            self.api(path)

    def do_POST(self):
        self.api(urlsplit(self.path).path)

    def log_message(self, format, *args):
        # Os códigos são enviados em cabeçalho e as requisições não são registradas.
        pass

    def api(self, path):
        key = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        admin = bool(key and hmac.compare_digest(key.encode(), ADMIN.encode()))
        with closing(connect()) as db:
            hashed = digest(key)
            if not admin and not db.execute(
                "SELECT 1 FROM invites WHERE code_hash=? AND active=1", (hashed,)
            ).fetchone():
                self.error(401, "Use um código de acesso válido.")
                return
            if self.command == "GET":
                if path == "/api/channels":
                    self.send(200, catalogo_canais())
                    return
                if path == "/api/regulation":
                    self.send(200, documento_regulamento())
                    return
                request_match = re.fullmatch(r"/api/requests/(SOL-[A-F0-9]{12})", path)
                cleaning_match = re.fullmatch(r"/api/cleaning/(SOL-[A-F0-9]{12})", path)
                if path == "/api/requests" or request_match:
                    if admin:
                        self.error(403, "Use a fila de limpeza no perfil da gestão.")
                        return
                    residence = db.execute("SELECT residence_id FROM invites WHERE code_hash=? AND active=1", (hashed,)).fetchone()
                    if residence is None:
                        self.error(401, "Use um código de acesso válido.")
                        return
                    rows = listar_solicitacoes(db, residence["residence_id"], request_match[1] if request_match else None)
                    if request_match and not rows:
                        self.error(404, "Solicitação não encontrada para esta residência.")
                    else:
                        self.send(200, {"request": rows[0]} if request_match else {"requests": rows})
                    return
                if path == "/api/cleaning" or cleaning_match:
                    if not admin:
                        self.error(403, "A fila de limpeza é exclusiva da gestão.")
                        return
                    rows = listar_fila_limpeza(db, cleaning_match[1] if cleaning_match else None)
                    if cleaning_match and not rows:
                        self.error(404, "Ordem de serviço não encontrada.")
                    else:
                        self.send(200, {"order": rows[0]} if cleaning_match else {"orders": rows})
                    return
            if self.command == "GET" and path == "/api/surveys":
                payload = {"name": NAME, "admin": admin, "surveys": list_surveys(db, hashed)}
                if admin:
                    payload["residences"] = [dict(r) for r in db.execute("SELECT id,identifier FROM residences ORDER BY id")]
                self.send(200, payload)
                return
            if self.command != "POST":
                self.error(404, "Endereço não encontrado.")
                return
            try:
                size = int(self.headers.get("Content-Length", 0))
                if not 0 < size <= 8192 or self.headers.get_content_type() != "application/json":
                    raise ValueError("Formato da solicitação inválido.")
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict):
                    raise ValueError("Formato da solicitação inválido.")
                if path == "/api/assistant/question":
                    if admin:
                        raise PermissionError()
                    # A IA recebe só as fontes permitidas; rede fora de transação de escrita.
                    question = _texto(data.get("question"), 'a dúvida')
                    residence = db.execute("SELECT residence_id FROM invites WHERE code_hash=? AND active=1", (hashed,)).fetchone()
                    if residence is None:
                        raise PermissionError()
                    result = responder_status(db, residence["residence_id"], question)
                    if result is None:
                        result = responder_duvida(question, fontes_publicadas(list_surveys(db, hashed)))
                    self.send(200, result)
                    return
                with db:
                    # Impede que o encerramento ou outro voto altere o estado durante a validação.
                    db.execute("BEGIN IMMEDIATE")
                    # Revalida dentro da transação para impedir uso de código revogado
                    # entre a autenticação e o registro de participação.
                    if not admin and not db.execute("SELECT 1 FROM invites WHERE code_hash=? AND active=1", (hashed,)).fetchone():
                        raise PermissionError()
                    payload = self.mutate(db, path, data, admin, hashed)
                self.send(200, payload)
            except sqlite3.DatabaseError:
                self.error(500, "Não foi possível salvar a operação. Nenhuma alteração foi confirmada. Tente novamente.")
            except PermissionError:
                self.error(403, "Esta ação não está disponível para seu perfil.")
            except LookupError:
                self.error(404, "Consulta ou ação não encontrada.")
            except (ValueError, UnicodeError) as error:
                message = "Dados inválidos." if isinstance(error, (json.JSONDecodeError, UnicodeError)) else str(error)
                self.error(400, message)

    def mutate(self, db, path, data, admin, hashed):
        if path in ("/api/assistant/cleaning/preview", "/api/assistant/cleaning/confirm"):
            if admin:
                raise PermissionError()
            residence = db.execute("SELECT residence_id FROM invites WHERE code_hash=? AND active=1", (hashed,)).fetchone()
            if residence is None:
                raise PermissionError()
            if path.endswith("/preview"):
                return preparar_limpeza(db, residence["residence_id"], data)
            return {"request": confirmar_limpeza(db, residence["residence_id"], data)}
        if path == "/api/requests":
            if admin:
                raise PermissionError()
            # A residência vem do código autenticado, nunca do corpo do formulário.
            residence = db.execute("SELECT residence_id FROM invites WHERE code_hash=? AND active=1", (hashed,)).fetchone()
            if residence is None:
                raise PermissionError()
            request = criar_solicitacao(db, residence["residence_id"], data.get("local"),
                                       data.get("category"), data.get("description"))
            return {"request": request}
        complete = re.fullmatch(r"/api/cleaning/(SOL-[A-F0-9]{12})/complete", path)
        if complete:
            if not admin:
                raise PermissionError()
            return {"order": concluir_ordem(db, complete[1], data.get("feedback"))}
        if path in ("/api/invites", "/api/surveys") and not admin:
            raise PermissionError()
        if path == "/api/invites":
            code = issue_code(db, data.get("residence"))
            return {"code": code}
        if path == "/api/surveys" and admin:
            survey_id = new_survey(db, data)
            return {"ok": True, "id": survey_id}
        match = re.fullmatch(r"/api/surveys/([0-9]{1,12})/(vote|close|response)", path)
        if not match:
            raise LookupError()
        survey_id, action = match.groups()
        row = db.execute("SELECT * FROM surveys WHERE id=?", (survey_id,)).fetchone()
        if row is None:
            raise LookupError()
        if action == "vote":
            if admin:
                raise PermissionError()
            if row["closed"]:
                raise ValueError("Esta consulta já foi encerrada.")
            if row["deadline"] and date.today().isoformat() > row["deadline"]:
                raise ValueError("O prazo de participação terminou. Aguarde o encerramento pela gestão.")
            questions = json.loads(row["questions"])
            choices = data.get("choices")
            if (not isinstance(choices, list) or len(choices) != len(questions)
                or any(type(value) is not int or not 0 <= value < len(q["options"])
                       for value, q in zip(choices, questions))):
                raise ValueError("Selecione uma opção válida por pergunta.")
            result = db.execute("INSERT OR IGNORE INTO votes(survey,invite,choices,residence_id) SELECT ?,?,?,residence_id FROM invites WHERE code_hash=? AND active=1",
                                (survey_id, hashed, json.dumps(choices), hashed))
            if not result.rowcount:
                raise ValueError("Sua participação já foi registrada nesta consulta.")
        else:
            if not admin:
                raise PermissionError()
            if action == "close":
                db.execute("UPDATE surveys SET closed=1 WHERE id=?", (survey_id,))
            else:
                if not row["closed"]:
                    raise ValueError("Encerre a consulta antes de publicar o encaminhamento.")
                status = clean(data.get("subject_status", row["subject_status"]), 80)
                if status not in ("Aguardando retorno", "Em análise", "Em andamento", "Concluído"):
                    raise ValueError("Selecione um status válido.")
                db.execute("UPDATE surveys SET response=?,subject_status=?,responsible=?,next_update=?,completion=?,next_step=? WHERE id=?",
                           (clean(data.get("response"), 1500), status, optional(data, "responsible"),
                            date_field(data, "next_update"), date_field(data, "completion"),
                            optional({"next_step": data.get("next_step", row["next_step"])}, "next_step", 1500), survey_id))
        return {"ok": True}


if __name__ == "__main__":
    init()
    host = os.environ.get("RESIDENCIAL_HOST", "127.0.0.1")
    port = int(os.environ.get("RESIDENCIAL_PORT", "8000"))
    with ThreadingHTTPServer((host, port), Handler) as server:
        print(f"Abra http://{host}:{server.server_port}", flush=True)
        print(f"Código da gestão: {ADMIN}", flush=True)
        server.serve_forever()
