"""Integração real HTTP/SQLite: automação, isolamento e atomicidade."""
import json
import os
import sqlite3
import tempfile
import threading
import unittest
from contextlib import closing
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import server
from encaminhamento import identificar_equipe


class CleaningFlow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.previous_db = server.DATABASE
        server.DATABASE = os.path.join(self.tmp.name, 'cleaning.sqlite3')
        server.init()
        with closing(server.connect()) as db, db:
            self.a = server.issue_code(db, 'DEMO-01', 'demo-morador-1')
            self.b = server.issue_code(db, 'DEMO-02', 'demo-morador-2')
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown(); self.http.server_close(); self.thread.join()
        server.DATABASE = self.previous_db
        self.tmp.cleanup()

    def api(self, path, data=None, code=None):
        req = Request(f'http://127.0.0.1:{self.http.server_port}'+path,
                      data=None if data is None else json.dumps(data).encode(),
                      headers={'Authorization':'Bearer '+(code or self.a),'Content-Type':'application/json'})
        try:
            with urlopen(req) as response:return response.status,json.load(response)
        except HTTPError as response:
            with response:return response.code,json.load(response)

    def create(self, **overrides):
        return self.api('/api/requests', {'local':'Academia','category':'Higiene',
                        'description':'Os aparelhos da academia estão sujos', **overrides})

    def test_automatic_order_privacy_rotation_completion_and_persistence(self):
        status, result = self.create(residence_id=2, status='Concluída', team='Conselho')
        self.assertEqual(status,200)
        protocol = result['request']['protocol']
        self.assertTrue(protocol.startswith('SOL-'))
        request_path='/api/requests/'+protocol
        task_path='/api/cleaning/'+protocol
        own=self.api(request_path)[1]['request']
        self.assertEqual(own['status'],'Pendente');self.assertEqual(own['team'],'Equipe de limpeza')
        self.assertEqual(own['description'],'Os aparelhos da academia estão sujos')
        self.assertEqual(self.api('/api/requests',code=self.b)[1]['requests'],[])
        self.assertEqual(self.api(request_path,code=self.b)[0],404)
        self.assertEqual(self.api('/api/cleaning')[0],403)
        self.assertEqual(self.api(task_path)[0],403)
        self.assertEqual(self.api(task_path+'/complete',{'feedback':'Inválido'})[0],403)
        self.assertEqual(self.api('/api/requests',{'local':'Academia','category':'Higiene','description':'X'},server.ADMIN)[0],403)
        queue=self.api('/api/cleaning',code=server.ADMIN)[1]['orders']
        self.assertEqual(len(queue),1);self.assertEqual(queue[0]['protocol'],protocol)
        with closing(server.connect()) as db, db: replacement=server.issue_code(db,'DEMO-01')
        self.assertEqual(self.api(request_path)[0],401)
        self.assertEqual(self.api(request_path,code=replacement)[1]['request']['protocol'],protocol)
        self.assertEqual(self.api(task_path+'/complete',{'feedback':' '},server.ADMIN)[0],400)
        self.assertEqual(self.api(task_path+'/complete',{'feedback':'Aparelhos higienizados'},server.ADMIN)[0],200)
        # Repetir não pode sobrescrever o retorno publicado.
        self.assertEqual(self.api(task_path+'/complete',{'feedback':'Outro texto'},server.ADMIN)[0],400)
        server.init()
        own=self.api(request_path,code=replacement)[1]['request']
        task=self.api(task_path,code=server.ADMIN)[1]['order']
        self.assertEqual(own,task)
        self.assertEqual(own['status'],'Concluída');self.assertEqual(own['feedback'],'Aparelhos higienizados')
        self.assertTrue(own['completed_at'])
        self.assertEqual(self.api('/api/requests',code=self.b)[1]['requests'],[])

    def test_invalid_input_does_not_create_requests_or_orders(self):
        for data in [{'description':''},{'description':' '*4},{'description':'x'*1501},
                     {'description':5},{'local':'Piscina'},{'local':None},{'category':'Manutenção'}]:
            self.assertEqual(self.create(**data)[0],400,data)
        self.assertEqual(self.api('/api/requests')[1]['requests'],[])
        self.assertEqual(self.api('/api/cleaning',code=server.ADMIN)[1]['orders'],[])

    def test_order_insert_failure_rolls_back_request(self):
        with closing(server.connect()) as db, db:
            db.execute("CREATE TRIGGER fail_order BEFORE INSERT ON work_orders BEGIN SELECT RAISE(ABORT, 'forced failure'); END")
        self.assertEqual(self.create()[0],500)
        with closing(server.connect()) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM service_requests').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT count(*) FROM work_orders').fetchone()[0],0)

    def test_completion_failure_keeps_pending_without_feedback(self):
        status,result=self.create();self.assertEqual(status,200)
        protocol=result['request']['protocol']
        with closing(server.connect()) as db, db:
            db.execute("CREATE TRIGGER fail_completion BEFORE UPDATE ON work_orders BEGIN SELECT RAISE(ABORT, 'forced failure'); END")
        self.assertEqual(self.api('/api/cleaning/'+protocol+'/complete',{'feedback':'Aparelhos higienizados'},server.ADMIN)[0],500)
        request=self.api('/api/requests/'+protocol)[1]['request']
        self.assertEqual(request['status'],'Pendente');self.assertEqual(request['feedback'],'');self.assertIsNone(request['completed_at'])


class CleaningMigration(unittest.TestCase):
    def test_copy_of_gs2_database_keeps_surveys_votes_and_responses(self):
        previous=server.DATABASE
        try:
            with tempfile.TemporaryDirectory() as tmp:
                original=Path(tmp)/'gs2.sqlite3';copied=Path(tmp)/'copy.sqlite3'
                # Schema GS2 anterior à automação, sem depender de .git no pacote.
                with closing(sqlite3.connect(original)) as db, db:
                    db.executescript("""
                        CREATE TABLE residences(id INTEGER PRIMARY KEY,identifier TEXT NOT NULL UNIQUE);
                        CREATE TABLE invites(code_hash TEXT PRIMARY KEY,residence_id INTEGER REFERENCES residences(id),active INTEGER NOT NULL DEFAULT 1);
                        CREATE TABLE surveys(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,questions TEXT NOT NULL,
                            closed INTEGER NOT NULL DEFAULT 0,response TEXT NOT NULL DEFAULT '',deadline TEXT NOT NULL DEFAULT '',
                            cost TEXT NOT NULL DEFAULT '',impacts TEXT NOT NULL DEFAULT '',responsible TEXT NOT NULL DEFAULT '',
                            next_update TEXT NOT NULL DEFAULT '',completion TEXT NOT NULL DEFAULT '',next_step TEXT NOT NULL DEFAULT '',
                            subject_status TEXT NOT NULL DEFAULT 'Aguardando retorno');
                        CREATE TABLE votes(survey INTEGER REFERENCES surveys(id),invite TEXT REFERENCES invites(code_hash),
                            choices TEXT NOT NULL,residence_id INTEGER REFERENCES residences(id),PRIMARY KEY(survey,invite));
                    """)
                    db.execute("INSERT INTO residences VALUES(1,'DEMO-01')")
                    code_hash=server.digest('old-code')
                    db.execute('INSERT INTO invites VALUES(?,1,1)',(code_hash,))
                    db.execute("INSERT INTO surveys(id,title,description,questions,closed,response,next_step) VALUES(1,'GS2','Preservar',?,1,'Devolutiva GS2','Próximo passo GS2')",
                               (json.dumps([{'label':'Pergunta','options':['A','B']}]),))
                    db.execute('INSERT INTO votes VALUES(1,?,?,1)',(code_hash,'[1]'))
                    expected={table:[tuple(r) for r in db.execute('SELECT * FROM '+table)] for table in ['surveys','votes','invites','residences']}
                original_bytes=original.read_bytes()
                with closing(sqlite3.connect(original)) as src, closing(sqlite3.connect(copied)) as dst:src.backup(dst)
                server.DATABASE=str(copied);server.init();server.init()
                with closing(server.connect()) as db:
                    for table,rows in expected.items():self.assertEqual([tuple(r) for r in db.execute('SELECT * FROM '+table)],rows)
                    self.assertEqual(db.execute('SELECT count(*) FROM service_requests').fetchone()[0],0)
                    self.assertEqual(db.execute('SELECT count(*) FROM work_orders').fetchone()[0],0)
                self.assertEqual(original.read_bytes(),original_bytes)
        finally:server.DATABASE=previous

    def test_routing_rule(self):
        self.assertEqual(identificar_equipe(' ACADEMIA ',' higiene '),'Equipe de limpeza')
        self.assertIsNone(identificar_equipe('Academia','Iluminação'))
        self.assertIsNone(identificar_equipe('Salão','Higiene'))
