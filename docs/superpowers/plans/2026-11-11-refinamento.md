# Refinamento do portal para demonstração GS2

Especificação: pedido de 11/11/2026, README e dois PNGs em wireframes/. Executar localmente preservando a estrutura HTML/CSS/JS/Python/SQLite.

Decisões: navegação por hash (sem dependência ou nova rota de servidor) em vez de modais longos; código de acesso continua só em memória, recarregar exige login e retoma o endereço. Saída volta à lista. Banco demonstrativo novo `demo-gs2.sqlite3`; nenhum banco anterior será reescrito para montar os cenários. Consultas existentes mantêm perguntas, índices das opções, votos e retorno. Novos exemplos oferecem Não se aplica na duração.

- [x] Rodar testes existentes como referência.
- [x] Escrever teste de navegação/lista sem formulários, encaminhamentos só de encerradas, detalhe único, tarefas de gestão e fluxo completo; observar falha antes de alterar interface.
- [x] Implementar migração aditiva de `next_step`, preservar retorno em `response`; testar numa cópia SQLite de uma base legada.
- [x] Preparar base nova com três consultas demonstrativas (aberta, encerrada sem retorno, encerrada com retorno); testar que seed não reescreve dados já existentes.
- [x] Refazer telas de acesso, consultas, acompanhamento, detalhe, gestão e regras. Usar linguagem e identidade dos wireframes; impedir mistura de status aberto/encaminhamento.
- [x] Testar ciclo gestão → publicação → duas participações → encerramento → devolutiva → morador, rotação de código, persistência, navegação direta, teclado, erros e larguras 375/1280.
- [x] Atualizar README, capturas e revisão final.

Pontos de revisão: preservar semântica de índices; recarregar/logout sem expor sessão; não expor contagens abertas; só consultas encerradas no acompanhamento; não alterar base antiga para preparar demonstração.


Verificação executada: suíte original antes das alterações; seis testes Python após as alterações; teste Chromium com base temporária em 375 e 1280 px. Migração feita numa cópia SQLite controlada, com origem intacta. Testes de interface observaram falhas antes da implementação para lista/detalhe e para o atalho ao conteúdo.

Revisão independente: detectou atualização tardia que podia redesenhar perfil após logout. Reproduzida no teste real com resposta HTTP atrasada; corrigida por geração de sessão na camada de API e descarte de erros de formulários encerrados. Sem mudança nas permissões de servidor. Teste de regressão inclui Sair durante atualização pendente.

Nenhuma base utilizada anteriormente foi aberta pelos testes. Os cenários são criados somente em bancos temporários durante a verificação; a demonstração padrão passa a usar demo-gs2.sqlite3. Nenhum envio ou publicação foi feito.
