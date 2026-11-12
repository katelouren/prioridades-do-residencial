"""Teste manual separado: exige configuração própria do PR e faz uma chamada real."""
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
if not os.environ.get('GEMINI_API_KEY') or not os.environ.get('GEMINI_MODEL'):
    print('NÃO EXECUTADO: configure GEMINI_API_KEY e GEMINI_MODEL do PR no servidor.')
    sys.exit(2)

with tempfile.TemporaryDirectory(prefix='pr-gemini-real-') as folder:
    os.environ['RESIDENCIAL_DB'] = str(Path(folder) / 'real.sqlite3')
    import demo
    import server
    demo.seed()
    http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    try:
        req = Request(f'http://127.0.0.1:{http.server_port}/api/assistant/question',
                      data=json.dumps({'question': 'O que foi decidido sobre iluminação?'}).encode(),
                      headers={'Authorization': 'Bearer demo-morador-1', 'Content-Type': 'application/json'})
        with urlopen(req, timeout=20) as response:
            result = json.load(response)
        if result.get('mode') != 'live':
            print('SEM SUCESSO REAL: o provedor ficou indisponível; o portal retornou orientações locais.')
            sys.exit(1)
        assert result['provider'] == 'gemini' and result['sources'] and result['answer']
        print('OK: chamada real ao Gemini pela rota autenticada, com fontes do PR e banco temporário.')
    finally:
        http.shutdown()
        http.server_close()
        thread.join()
