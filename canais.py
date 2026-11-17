"""Catálogo único de canais publicados para portal e assistente."""
import json
from pathlib import Path


def catalogo():
    return json.loads((Path(__file__).resolve().parent/'data'/'canais.json').read_text(encoding='utf-8'))


def conteudo(channel):
    return f'{channel["subject"]}: {" e ".join(channel["owners"])}. Contato: {channel["contact"]}.'


def fonte():
    data=catalogo()
    return {'kind':'channels','title':'Canais por assunto','href':'#regras',
            'content':data['notice']+'\n'+'\n'.join(conteudo(channel) for channel in data['channels'])}


def fonte_assunto(source, channel):
    return {'id':source['id'],'kind':'channel','channel_id':channel['id'],
            'title':source['title'],'href':source['href'],'content':conteudo(channel)}
