# Painel administrativo da gestão

Fonte: pedido atual, README e implementação. Prints da Meta não estão disponíveis na pasta; usar disposição descrita e identidade do residencial. Sem alterar API, banco ou telas de participação do morador.

Arquitetura: sidebar/header somente para model.admin; rotas por hash existentes mais #visao-geral e #devolutivas. Visão geral deriva até três indicadores e pendências dos dados carregados (limpeza primeiro). Diálogo nativo acessível para boas-vindas/tour, uma preferência localStorage; nenhum código ou dado de usuário persistido. CSS administrativo limitado a body.admin.

- [x] Escrever teste Chromium que detecte ausência da visão geral/introdução antes de implementar.
- [x] Montar shell administrativo desktop/mobile, cinco itens reais, navegação e foco.
- [x] Montar visão geral compacta, indicadores, lista operacional e atalhos; adaptar Consultas/Devolutivas/Convites sem alterar as ações.
- [x] Criar boas-vindas com texto solicitado e tour de três passos, Esc, teclado/foco, destaque e fallback; garantir que a instrução não cobre o alvo no celular.
- [x] Adaptar testes anteriores ao menu móvel da gestão e à nova introdução; verificar regressão GS2/limpeza e morador sem interface administrativa.
- [x] Testar 375/1280, dispensar/reabrir introdução e tour, storage indisponível, alvos ausentes, indicadores/pendências e estado vazio com dados reais de teste.
- [x] Atualizar README, revisar e salvar em painel-gestao, sem push.

Preservação: main e automacao-limpeza mantêm seus commits. Nenhuma alteração no servidor ou schema é necessária. Todos os testes de fluxo usam banco temporário e seus próprios servidores.


Verificado: novo roteiro Chromium passou, incluindo 375×568 além de 375×812/1280×900; 12 testes Python passaram; roteiros GS2 e limpeza passaram; sintaxe JS e diff --check sem erros. Revisão identificou foco oculto após desktop→mobile: teste reproduziu, correção retorna ao Menu quando a origem fica invisível. Título administrativo volta ao topo ao navegar, evitando ficar sob o cabeçalho fixo. Nenhum arquivo Python, schema ou banco foi alterado nesta etapa. Tour em diálogo nativo, com ciclo explícito de Tab, Esc e restauração do foco.
