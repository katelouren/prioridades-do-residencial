# Gemini no assistente do PR, com preservação visual

Base 2ca9d59, Git limpo antes das alterações. Branch local assistente-gemini. Snapshot public/ + capturas em /tmp/pr-gemini-preservacao. Sem push.

Referência consultada: katelouren/happy-game-hub-cyber, app/api/assistant/route.js, main 692d0aabd65e56d25d6b29d77357d0d604bd0eb3. Padrões: chave só ambiente/cabeçalho, validação, generateContent, timeout, rejeição de bloqueio/saída incompleta e metadados live/local. Nenhuma chave daquele projeto acessada ou copiada.

Decisões: trocar o adaptador opcional OpenAI por Gemini em assistente.py; manter rota autenticada, fontes selecionadas no servidor e links confiáveis separados da geração. Origem explícita Gemini/orientações locais somente na tela Assistente. Limpeza continua extração local determinística e revisável (Gemini não precisa receber textos privados ou executar ações); fila e confirmação idempotente existentes sem alterações.

- [x] Capturar e comparar telas existentes com a referência atual.
- [x] Escrever testes Gemini antes do adaptador: contrato HTTP, chave fora da URL/body, fontes limitadas, português/citações, falhas/bloqueio/truncamento/JSON inválido/chave ausente, pergunta sem dados e tamanho inválido.
- [x] Implementar generateContent com GEMINI_API_KEY/GEMINI_MODEL, 12s de timeout, sem ferramentas; aceitar só STOP/texto não thought e sem eco da chave; fallback para links locais.
- [x] Adicionar indicação de origem só no Assistente; preservar todo CSS/index e outras funções visuais.
- [x] Testar questionário/fallback e fluxo de limpeza automático com confirmação e privacidade, em bancos temporários e sem rede externa nos testes automatizados.
- [x] Se chave própria do PR estiver configurada, rodar teste real separado; caso contrário registrar pendência sem pedir/reutilizar chave de outro projeto.
- [x] Atualizar README e exemplo fictício; revisar diff e salvar localmente.

Evidências: 21 testes Python OK; Chromium nos modos local e Gemini simulado em 375/1280 px OK (bancos temporários); 11 PNGs iguais à referência; hash de todos os arquivos public/ e docs/screenshots preservado salvo a única linha autorizada de origem em app.js. Teste real retornou NÃO EXECUTADO por ausência de configuração PR. Revisão corrigiu fallback HTTPException, com IncompleteRead/RemoteDisconnected cobertos. CSS, index, navegação, server.py e operacional intactos.
