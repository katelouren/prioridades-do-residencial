import json
import os
import sqlite3
import tempfile
import threading
import unittest
from contextlib import closing
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import server

class Flow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        server.DATABASE = os.path.join(self.tmp.name, 'test.sqlite3')
        server.init()
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
    def tearDown(self):
        self.http.shutdown(); self.http.server_close(); self.thread.join(); self.tmp.cleanup()
    def api(self, path='/api/surveys', data=None, code=None):
        req = Request(f'http://127.0.0.1:{self.http.server_port}'+path,
                      data=None if data is None else json.dumps(data).encode(),
                      headers={'Authorization': 'Bearer '+(code or server.ADMIN), 'Content-Type':'application/json'})
        try:
            with urlopen(req) as r: return r.status, json.load(r)
        except HTTPError as r:
            with r: return r.code, json.load(r)
    def test_residence_rotation_results_and_persistence(self):
        a = self.api('/api/invites', {'residence':'DEMO-01'})[1]['code']
        b = self.api('/api/invites', {'residence':'DEMO-02'})[1]['code']
        body = {'title':'Teste', 'description':'Consulta consultiva', 'questions':[
            {'label':f'Pergunta {i}', 'options':['Sim','Não','Sem preferência']} for i in range(3)]}
        self.assertEqual(self.api(data=body)[0], 200)
        s = self.api(code=a)[1]['surveys'][0]; sid=s['id']; path=f'/api/surveys/{sid}'
        self.assertNotIn('totals', s); self.assertNotIn('count', s)
        self.assertEqual(self.api(path+'/vote', {'choices':[0,1,2]}, a)[0],200)
        self.assertEqual(self.api(path+'/vote', {'choices':[1,1,1]}, b)[0],200)
        a2 = self.api('/api/invites', {'residence':'DEMO-01'})[1]['code']
        self.assertEqual(self.api(code=a)[0],401)
        self.assertEqual(self.api(path+'/vote', {'choices':[0,0,0]},a2)[0],400)
        self.assertTrue(self.api(code=a2)[1]['surveys'][0]['voted'])
        for endpoint, data in [('/api/invites',{'residence':'X'}),('/api/surveys',body),(path+'/close',{}),(path+'/response',{'response':'x'})]:
            self.assertEqual(self.api(endpoint,data,a2)[0],403)
        self.assertEqual(self.api(path+'/close',{})[0],200)
        c=self.api('/api/invites',{'residence':'DEMO-03'})[1]['code']
        self.assertEqual(self.api(path+'/vote',{'choices':[0,0,0]},c)[0],400)
        update={'next_step':'Solicitar três propostas.', 'response':'Gestão solicitará orçamento.', 'subject_status':'Em andamento','responsible':'Administração','next_update':'2027-01-15','completion':''}
        self.assertEqual(self.api(path+'/response',update)[0],200)
        self.http.shutdown(); self.http.server_close(); self.thread.join()
        server.init()
        self.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True); self.thread.start()
        s=self.api(code=a2)[1]['surveys'][0]
        self.assertEqual(s['count'],2); self.assertEqual(s['totals'],[[1,1,0],[0,2,0],[0,1,1]])
        for k,v in update.items(): self.assertEqual(s[k],v)
        with closing(server.connect()) as db, db:
            inv=db.execute('SELECT code_hash,residence_id FROM invites WHERE active=1 LIMIT 1').fetchone()
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('INSERT INTO invites(code_hash,residence_id,active) VALUES(?,?,1)',('other',inv['residence_id']))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('INSERT INTO votes(survey,invite,choices,residence_id) VALUES(?,?,?,?)',(sid,inv['code_hash'],'[0,0,0]',inv['residence_id']))


class Migration(unittest.TestCase):
    def test_legacy_data_survives_idempotent_migration(self):
        with tempfile.TemporaryDirectory() as tmp:
            server.DATABASE=os.path.join(tmp,'legacy.sqlite3')
            with closing(sqlite3.connect(server.DATABASE)) as db, db:
                db.executescript('''CREATE TABLE invites(code_hash TEXT PRIMARY KEY);
                CREATE TABLE surveys(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,questions TEXT NOT NULL,closed INTEGER NOT NULL DEFAULT 0,response TEXT NOT NULL DEFAULT '');
                CREATE TABLE votes(survey INTEGER REFERENCES surveys(id),invite TEXT REFERENCES invites(code_hash),choices TEXT NOT NULL,PRIMARY KEY(survey,invite));''')
                db.execute('INSERT INTO invites VALUES(?)',(server.digest('old'),))
                db.execute('INSERT INTO surveys VALUES(1,?,?,?,?,?)',('Consulta antiga','Contexto',json.dumps([{'label':'Pergunta','options':['A','B']}]),1,'Devolutiva antiga'))
                db.execute('INSERT INTO votes VALUES(1,?,?)',(server.digest('old'),'[1]'))
            server.init(); server.init()
            with closing(server.connect()) as db, db:
                s=server.list_surveys(db,server.digest('old'))[0]
                self.assertEqual(s['response'],'Devolutiva antiga'); self.assertEqual(s['totals'],[[0,1]])
                self.assertTrue(s['voted']); self.assertEqual(s['count'],1)
                identifier=db.execute('SELECT identifier FROM residences').fetchone()[0]
                replacement=server.issue_code(db,identifier)
                self.assertTrue(server.list_surveys(db,server.digest(replacement))[0]['voted'])
                self.assertEqual(db.execute('SELECT active FROM invites WHERE code_hash=?',(server.digest('old'),)).fetchone()[0],0)

    def test_invalid_dates_and_expired_deadline(self):
        with tempfile.TemporaryDirectory() as tmp:
            server.DATABASE=os.path.join(tmp,'dates.sqlite3');server.init()
            with closing(server.connect()) as db, db:
                body={'title':'Prazo','description':'Teste','questions':[{'label':'P','options':['A','B']}], 'deadline':'2026-02-30'}
                with self.assertRaises(ValueError):server.new_survey(db,body)
                body['deadline']='2000-01-01';server.new_survey(db,body)
                c=server.issue_code(db,'DEMO')
                handler=object.__new__(server.Handler)
                with self.assertRaisesRegex(ValueError,'prazo'):
                    handler.mutate(db,'/api/surveys/1/vote',{'choices':[0]},False,server.digest(c))

class DemoSeed(unittest.TestCase):
    def test_seed_preserves_rotated_code_and_votes(self):
        import demo
        with tempfile.TemporaryDirectory() as tmp:
            server.DATABASE=os.path.join(tmp,'demo-test.sqlite3')
            demo.seed()
            with closing(server.connect()) as db, db:
                sid=db.execute('SELECT id FROM surveys WHERE closed=0 ORDER BY id LIMIT 1').fetchone()[0]
                questions=json.loads(db.execute('SELECT questions FROM surveys WHERE id=?',(sid,)).fetchone()[0])
                handler=object.__new__(server.Handler)
                handler.mutate(db,f'/api/surveys/{sid}/vote',{'choices':[0]*len(questions)},False,server.digest('demo-morador-1'))
                replacement=server.issue_code(db,'DEMO-01')
            demo.seed();demo.seed()
            with closing(server.connect()) as db, db:
                self.assertEqual(db.execute('SELECT count(*) FROM surveys').fetchone()[0],3)
                self.assertEqual(db.execute('SELECT active FROM invites WHERE code_hash=?',(server.digest('demo-morador-1'),)).fetchone()[0],0)
                self.assertTrue(next(s for s in server.list_surveys(db,server.digest(replacement)) if s['id']==sid)['voted'])

class Showcase(unittest.TestCase):
    def test_fresh_demo_covers_states_and_keeps_old_options_on_existing_base(self):
        import demo
        with tempfile.TemporaryDirectory() as tmp:
            server.DATABASE=os.path.join(tmp,'fresh.sqlite3')
            demo.seed()
            with closing(server.connect()) as db, db:
                rows=list(db.execute('SELECT * FROM surveys ORDER BY id'))
                self.assertEqual(len(rows),3)
                self.assertEqual(sum(not r['closed'] for r in rows),1)
                self.assertEqual(sum(bool(r['closed'] and not r['response']) for r in rows),1)
                self.assertEqual(sum(bool(r['closed'] and r['response']) for r in rows),1)
                opened=next(r for r in rows if not r['closed'])
                questions=json.loads(opened['questions'])
                self.assertEqual(questions[2]['options'][-1],'Não se aplica')
                # Simula uma consulta já utilizada: índices antigos devem ficar intactos.
                questions[2]['options'].pop()
                db.execute('UPDATE surveys SET questions=? WHERE id=?',(json.dumps(questions),opened['id']))
                code=server.digest('demo-morador-1')
                handler=object.__new__(server.Handler)
                handler.mutate(db,f"/api/surveys/{opened['id']}/vote",{'choices':[0,2,3]},False,code)
                db.execute('UPDATE surveys SET response=? WHERE closed=1',('Retorno preservado',))
                expected=[tuple(r) for r in db.execute('SELECT * FROM surveys ORDER BY id')]
                votes=[tuple(r) for r in db.execute('SELECT * FROM votes ORDER BY survey,invite')]
            demo.seed()
            with closing(server.connect()) as db:
                self.assertEqual([tuple(r) for r in db.execute('SELECT * FROM surveys ORDER BY id')],expected)
                self.assertEqual([tuple(r) for r in db.execute('SELECT * FROM votes ORDER BY survey,invite')],votes)

    def test_migration_runs_on_copy_without_changing_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=os.path.join(tmp,'source.sqlite3'); copied=os.path.join(tmp,'copy.sqlite3')
            with closing(sqlite3.connect(source)) as db, db:
                db.executescript("CREATE TABLE invites(code_hash TEXT PRIMARY KEY); CREATE TABLE surveys(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,questions TEXT NOT NULL,closed INTEGER NOT NULL DEFAULT 0,response TEXT NOT NULL DEFAULT ''); CREATE TABLE votes(survey INTEGER REFERENCES surveys(id),invite TEXT REFERENCES invites(code_hash),choices TEXT NOT NULL,PRIMARY KEY(survey,invite));")
                db.execute('INSERT INTO surveys VALUES(1,?,?,?,?,?)',('Legado','Contexto',json.dumps([{'label':'Pergunta','options':['A','B']}]),1,'Decisão registrada'))
                db.execute('INSERT INTO invites VALUES(?)',(server.digest('copy-code'),))
                db.execute('INSERT INTO votes VALUES(1,?,?)',(server.digest('copy-code'),'[1]'))
            with open(source,'rb') as f:original=f.read()
            with closing(sqlite3.connect(source)) as src, closing(sqlite3.connect(copied)) as dst:src.backup(dst)
            server.DATABASE=copied;server.init();server.init()
            with closing(server.connect()) as db:
                s=server.list_surveys(db,server.digest('copy-code'))[0]
                self.assertEqual(s['response'],'Decisão registrada');self.assertEqual(s['totals'],[[0,1]])
                self.assertEqual(s['next_step'],'')
            with open(source,'rb') as f:self.assertEqual(f.read(),original)

if __name__=='__main__': unittest.main()
