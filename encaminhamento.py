"""Regras demonstrativas para identificar a equipe de uma solicitação."""


def identificar_equipe(local, categoria):
    local = local.strip().casefold()
    categoria = categoria.strip().casefold()

    if local == "academia" and categoria == "higiene":
        return "Equipe de limpeza"

    return None
