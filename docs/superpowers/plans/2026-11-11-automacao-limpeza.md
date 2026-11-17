# Automação de limpeza — execução local

Objetivo: solicitação Academia + Higiene gera automaticamente ordem de limpeza; gestão conclui com devolutiva; residência acompanha o mesmo protocolo.

Arquitetura: reaproveitar encaminhamento.identificar_equipe; módulo solicitacoes.py para schema aditivo, regra e persistência. requests guarda residência e descrição; work_orders guarda status/devolutiva e vínculo único. API identifica residência pelo código ativo dentro da transação existente. Não haverá status duplicado para sincronizar.

Branch: automacao-limpeza, no checkout atual solicitado; main preservada; encaminhamento.py local reaproveitado. Sem publicar ou enviar ao GitHub nesta etapa.

- [x] Executar suíte GS2 como referência.
- [x] Escrever testes HTTP de criação automática, privacidade, rotação e conclusão; invalidar dados e simular falhas reais de INSERT/UPDATE por trigger SQLite para verificar rollback.
- [x] Acrescentar tabelas por CREATE IF NOT EXISTS na transação de migração; testar em cópia de banco da main mantendo consultas/votos/devolutivas.
- [x] Implementar endpoints de morador e fila/fechamento da gestão com validação de perfil e residência no servidor.
- [x] Acrescentar Minhas solicitações / Fila de limpeza, descrição, protocolo, pendência, detalhe da tarefa, conclusão e retorno.
- [x] Testar no Chromium com banco temporário: demo-morador-1 → Os aparelhos da academia estão sujos → gestão → Aparelhos higienizados → mesmo morador, sem visibilidade para demo-morador-2; verificar GS2, reinício, 375/1280 e teclado.
- [x] Atualizar README e explicar gatilho, regra e transação por arquivo/função. Revisar alterações e confirmar branch local.

Fora do escopo: prazos, alertas, WhatsApp, agenda externa, outros locais/categorias e IA.


Verificação final: 12 testes Python passaram; node --check passou. Chromium: automação completa e roteiro GS2 passaram em bancos temporários, 375/1280 px, teclado/foco e sem erros JS/overflow. Testes provocaram falhas SQLite reais no INSERT da OS e no UPDATE de conclusão para confirmar rollback. Cópia de schema GS2 preservou consultas/votos/retornos e origem intacta. Revisão independente não encontrou defeitos importantes. Nenhum banco local existente foi alterado pelos testes; sem push, merge ou publicação.
