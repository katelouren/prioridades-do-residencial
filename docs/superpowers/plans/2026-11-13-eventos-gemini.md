# Eventos e validação Gemini

Escopo solicitado: melhorar intenção e respostas sem alterar aparência ou fluxo operacional, preservar todas as alterações locais e não publicar/commitar.

Diagnóstico inicial: demo.py herda variáveis de ambiente; não carrega .env. Sem chave/modelo no processo e sem .env do PR. “Quem cuida dos eventos?” retornou mode=local, fontes F3 Calendário anual de eventos, F4 Canais por assunto, F5 Documentos do residencial; texto inicial era devolutiva, não responsáveis. Canal Eventos e atividades publicava Associação.

- [x] Testes de fonte compartilhada/canais, quatro perguntas por intenção, seleção única de devolutiva e dados ausentes, carregamento seguro de .env próprio e modos local/simulado.
- [x] Fonte única de canais no servidor com Administração e Diretoria Social para Eventos, sem novos contatos/funções. Portal consome a mesma rota autenticada.
- [x] Prioridade por intenção: responsáveis/canal, devolutiva, artigo. Respostas curtas locais e instrução Gemini para responder na primeira frase sem inferir atribuições. Somente fontes pertinentes.
- [x] Carregar apenas GEMINI_API_KEY/MODEL de .env próprio sem executar shell, mantendo precedência do processo. Teste real em base fictícia quando configuração fornecida, sem logs de credenciais.
- [x] Rodar regressões Python/navegador, revisar diff, documentar diferença live/local/simulado e pendências reais.

## Validação efetiva
- Cinco testes novos de eventos/configuração; total 32 testes Python.
- eventos-ui com as quatro perguntas aprovado local, live simulado e falha simulada. regulamento-ui e cinco regressões UI (ui/limpeza/gestao/sistema/assistente) aprovados com bases fictícias; capturas anteriores preservadas.
- Revisão encontrou fallback genérico indevido quando falta consulta de evento; caso reproduzido por teste e corrigido por retorno explícito, com fonte única do canal publicado.
- demo.py agora carrega somente as duas variáveis Gemini do .env próprio, sem executar shell; ambiente tem prioridade; não existe modelo padrão. Valores de chave não foram exibidos.
- `python3 tests/gemini_real.py` executado em 13/11/2026 retornou código 2 / NÃO EXECUTADO, pois ainda não havia chave/modelo nem .env próprio disponível. Usuário informou que irá configurar; nenhuma chamada simulada foi contada como real.
- [ ] Pendente: repetir as quatro perguntas contra Gemini real após configuração própria do PR estar pronta.
- Aparência/CSS, permissões e confirmação/fila de limpeza preservadas; alterações locais anteriores mantidas, sem commit/push.
