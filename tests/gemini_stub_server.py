"""Servidor exclusivo dos testes de navegador; nenhuma chamada externa."""
import io
import json
import os
from pathlib import Path
import runpy
import sys
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
os.environ.update(GEMINI_API_KEY='chave-ficticia-teste', GEMINI_MODEL='modelo-ficticio')


def resposta(request, timeout):
    context = json.loads(json.loads(request.data)['contents'][0]['parts'][0]['text'])
    source = context['fontes'][0]['id']
    return io.BytesIO(json.dumps({'candidates': [{'finishReason': 'STOP', 'content': {
        'parts': [{'text': f'Resposta simulada: consulte a decisão publicada. [{source}]'}]}}]}).encode())


with patch('gemini_pr.urlopen', side_effect=resposta):
    runpy.run_path(str(root / 'demo.py'), run_name='__main__')
