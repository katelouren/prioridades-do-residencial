# Assistente flutuante — plano de implementação

Desenho aprovado pelo usuário em 12/11/2026: reaproveitar o backend Gemini e a fila operacional, substituindo a tela do assistente por painel sobre o portal do morador. Sem alterações no visual global ou na gestão. Trabalho na branch existente assistente-gemini, com Git inicialmente limpo, restrito ao PR-GlobalSolution.

## Arquitetura
Componente public/assistant.js, estilos public/assistant.css e integração mínima no ciclo de login/draw/logout de public/app.js. API e regras existentes permanecem no servidor. Fontes são links fornecidos pelo backend. Histórico somente em memória, eliminado ao sair; respostas assíncronas não atravessam sessões.

## Tarefas
- [x] Adaptar tests/assistente-ui.cjs para testar abertura sem rota, sugestões, Esc/foco, limpeza e privacidade. Executar e observar falha antes da implementação.
- [x] Implementar painel com conversa, fontes, carregamento/erro local e prévia editável manual. Confirmação usa token existente; acompanhamento consulta /api/requests.
- [x] Isolar CSS e ajustar altura/posição por visualViewport para teclado móvel; manter botão em margem reservada dentro do componente sem alterar espaçamentos globais.
- [x] Rodar testes Python, navegador local e Gemini simulado; comparar telas anteriores mascarando somente componente autorizado; revisar diff e documentação Mac/configuração.

## Foco da revisão
Fechar durante requisição; logout com resposta pendente; sugestões sem Gemini; erro ao confirmar e repetição com mesmo token; viewport curta com campo acessível. Não ler valores de credenciais de outro projeto. Teste Gemini real somente com configuração já presente no PR.

## Registro de execução
- Teste inicial falhou pela ausência do botão flutuante, antes da implementação.
- 21 testes Python passaram; testes Chrome local e Gemini simulado passaram com dados fictícios e base temporária.
- 11 capturas visuais comparadas com igualdade, ocultando apenas componente autorizado e antigo link.
- Ruling: manter a branch assistente-gemini e o diretório fornecido, respeitando escopo local exclusivo; sem commits, troca de branch ou publicação.
- Revisão independente encontrou desvio de perguntas sobre limpeza e cache de solicitações desatualizado; ambos corrigidos e cobertos no teste de navegador. Revisão das correções sem novos achados importantes.
- Falha de captura do Chrome após resize investigada: imagem duplicava cabeçalho no rodapé; aguardar compositor antes da captura resolveu sem mudar a interface.
- Modo real não executado: configuração Gemini não presente no ambiente do PR e arquivo .env inexistente. Não foram lidas credenciais de outros projetos.
