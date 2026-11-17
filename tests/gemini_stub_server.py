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
    if os.environ.get('PR_GEMINI_FAILURE')=='1':
        raise TimeoutError('Falha simulada, sem conexão externa')
    context = json.loads(json.loads(request.data)['contents'][0]['parts'][0]['text'])
    selected = context['fontes'][0]
    source = selected['id']
    if selected.get('channel_id')=='eventos':
        answer='Administração e Diretoria Social são as áreas responsáveis por Eventos. O contato ainda está A informar.'
    elif selected.get('kind')=='regulation':
        answer=selected['text']
    elif 'ainda não foi publicada' in selected['content']:
        answer=selected['content'].splitlines()[-1]
    else:
        answer='Resposta simulada: consulte a decisão publicada.'
    return io.BytesIO(json.dumps({'candidates': [{'finishReason': 'STOP', 'content': {
        'parts': [{'text': f'{answer} [{source}]'}]}}]}).encode())


with patch('gemini_pr.urlopen', side_effect=resposta):
    runpy.run_path(str(root / 'demo.py'), run_name='__main__')
