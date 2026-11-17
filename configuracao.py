"""Carrega somente configuração Gemini do .env próprio, sem executar shell."""
import os
from pathlib import Path


def carregar_gemini(path=None):
    path=Path(path) if path is not None else Path(__file__).resolve().parent/'.env'
    try:
        lines=path.read_text(encoding='utf-8').splitlines()
    except (OSError,UnicodeError):
        return
    for line in lines:
        line=line.strip().removeprefix('export ')
        name,separator,value=line.partition('=')
        name=name.strip()
        if not separator or name not in {'GEMINI_API_KEY','GEMINI_MODEL'}:
            continue
        value=value.strip()
        if len(value)>=2 and value[0]==value[-1] and value[0] in {'"',"'"}:
            value=value[1:-1]
        else:
            value=value.split(' #',1)[0].rstrip()
        os.environ.setdefault(name,value)
