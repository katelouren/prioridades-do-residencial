# Assistente do morador — preservação obrigatória do visual

Base: c5f61e5, Git limpo antes de editar. Referência adicional em /tmp/pr-assistente-preservacao contém os arquivos public/ e capturas originais. Branch local assistente-morador. Sem push.

Escopo visual: apenas nova tela #assistente e um link ao final do menu do morador, reaproveitando ícone/componente existente. Nenhuma mudança em login, guia, home, painel, tour, CSS global ou telas de chamados atuais. CSS novo, se necessário, somente sob #assistant-screen.

Arquitetura: assistente.py com fontes permitidas, busca e IA opcional Responses API (OPENAI_API_KEY + OPENAI_MODEL), fallback sem IA; conversa de limpeza determinística prepara resumo sem criar OS. Tabela nova assistant_drafts vincula token a residência e pedido confirmado. Confirmação explícita chama criar_solicitacao na mesma transação existente; token torna repetição idempotente. Fila e status existentes permanecem inalterados.

- [x] Capturar telas existentes antes de editar e comparar após, ocultando somente o novo link autorizado.
- [x] Escrever e observar falhas dos testes novos: resumo/complementação, confirmação idempotente/concorrrente, privacidade, rollback e fontes sem contagens abertas/dados privados.
- [x] Implementar módulos e endpoints novos sem refatorar os existentes. Rede de IA fora de transação de escrita; fallback em ausência/falha; nenhuma IA com permissão de gravar chamados.
- [x] Implementar tela Assistente com Tirar uma dúvida, Solicitar limpeza, resumo editável/Confirmar chamado e acompanhamento dos próprios protocolos.
- [x] Testar navegador com banco separado: academia suja → resumo → confirmar → fila existente → concluir → retorno no assistente; segundo morador isolado; 375/1280.
- [x] Testar integração de IA com resposta simulada do provedor; declarar que chamada externa real depende de configuração indisponível.
- [x] Executar regressões, revisar diff estético e atualizar README; preservar arquivos anteriores e registrar limitações.


Verificação concluída: 19 testes Python, roteiro novo do assistente e quatro roteiros UI anteriores passaram. O teste novo observou a ausência das rotas antes de implementar. Quatro confirmações concorrentes produziram um protocolo/uma OS; falha provocada no SQLite reverteu solicitação e vínculo, permitindo repetir. Outro morador não acessou rascunho nem protocolo. Fila antiga concluiu e devolutiva apareceu na tela do assistente.

Preservação: 11 PNGs anteriores à edição ficaram byte a byte idênticos após ocultar só o link novo autorizado. index.html, style.css e todos os PNGs preexistentes mantêm seus hashes originais. Diff de app.js restrito à nova função, rota/rótulo e link do morador. Revisão independente sem defeitos importantes. Limitação residual: citações da IA são verificadas contra IDs permitidos, mas a redação ainda depende do modelo; sem chave/modelo não houve chamada externa real. O caminho offline e respostas simuladas do provedor foram verificados.
