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
from configuracao import carregar_gemini
carregar_gemini()
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
        cases = [
            ('Quem cuida dos eventos?', '#regras'),
            ('Com quem eu falo sobre festas?', '#regras'),
            ('O que a gestão decidiu sobre o evento?', '#consulta/1'),
            ('Até que horas posso usar o salão?', '#regras/artigo/3'),
        ]
        successful = 0
        for question, href in cases:
            req = Request(f'http://127.0.0.1:{http.server_port}/api/assistant/question',
                          data=json.dumps({'question': question}).encode(),
                          headers={'Authorization': 'Bearer demo-morador-1', 'Content-Type': 'application/json'})
            with urlopen(req, timeout=20) as response:
                result = json.load(response)
            live = result.get('mode') == 'live'
            assert result['provider'] == 'gemini' and len(result['sources']) == 1
            assert result['sources'][0]['href'] == href
            successful += int(live)
            # Somente pergunta pública, modo e fonte; sem chave ou dados de moradores.
            print(json.dumps({'pergunta': question, 'mode': result['mode'],
                              'fonte': result['sources'][0]['title'], 'link': href}, ensure_ascii=False))
        if successful != len(cases):
            print(f'SEM SUCESSO COMPLETO REAL: {successful}/{len(cases)} chamadas live; demais respostas locais.')
            sys.exit(1)
        print('OK: 4 chamadas reais ao Gemini pela rota autenticada, uma fonte pertinente por pergunta e banco fictício temporário.')
    finally:
        http.shutdown()
        http.server_close()
        thread.join()
