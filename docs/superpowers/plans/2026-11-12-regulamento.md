# Regulamento interno — plano

Especificação: pedido completo anexado pelo usuário em 12/11/2026. Implementar diretamente no diretório PR-GlobalSolution, branch assistente-gemini, preservando todas as alterações já presentes e sem commit/push.

## Desenho
Fonte única `data/regulamento.json`, com código RH-RI-001, versão 1.0, data 12/11/2026, identificação acadêmica fictícia e 12 artigos fornecidos. Módulo `regulamento.py` fornece metadados, fontes e busca normalizada por assunto, sem dependências. GET autenticado `/api/regulation` abastece Regras e contatos; navegação hash `#regras/artigo/3` abre e foca o artigo. Assistente reutiliza as mesmas fontes e a redação Gemini opcional existente. Sem dados privados enviados ao modelo.

## Etapas
- [x] Testes Python primeiro: documento autenticado, artigos/versão, sinônimos/acentuação, fonte direta, ausência/ambiguidade, perguntas versus ação, registros do portal e status privado; observar falhas.
- [x] Dados e busca no servidor, respostas locais e Gemini opcional a partir de artigos selecionados. Status somente com filtro da residência, fora do Gemini. Pedido de limpeza apenas oferece prévia existente.
- [x] Leitura em Regras e contatos e links para artigos no roteamento existente; preservar estilo/painel/Esc/foco. Teste navegador com os sete casos solicitados e celular.
- [x] Suíte existente, falha Gemini simulada, revisão final e README com versão, demo e resultados reais.

## Revisão
Verificar que tarifa desconhecida nunca usa orçamento de evento; que horário da academia nunca recebe horário do salão; orientação de limpeza nunca cria chamado; que status de outro morador não é enviado ao Gemini; que link direto ao artigo funciona após login e Voltar. Mudanças visuais restritas à publicação e referências do documento.

## Evidências
- Novos testes executados antes de implementar: falhas por documento/recuperação/status ausentes.
- 27 testes Python aprovados, incluindo versão compartilhada 1.1 em arquivo temporário, resposta Gemini simulada, timeout, custo ausente diante de orçamento de evento, orientação versus ação e privacidade.
- ui.cjs, limpeza-ui.cjs, gestao-ui.cjs, sistema-ui.cjs e assistente-ui.cjs aprovados. A expectativa antiga de link Assistente no teste sistema foi atualizada para o botão flutuante já existente, sem mudança no menu nesta tarefa.
- regulamento-ui.cjs aprovado sem chave e com PR_GEMINI_FAILURE=1. assistente-ui.cjs também aprovado com Gemini simulado.
- Capturas atuais pelo assistente-visual.cjs em /tmp/pr-regulamento-capturas; esta etapa não compara a publicação autorizada do regulamento com o antigo placeholder.
- Revisão independente apontou dois casos (custo de reserva misturado com decisão de evento; pergunta sobre higienização tratada como ação). Ambos reproduzidos por testes, corrigidos e revisados sem novos achados importantes.
- CSS global, fila, regras de encaminhamento e bancos existentes preservados. Capturas anteriores restauradas após suítes legadas.
- Gemini real não executado: chave/modelo ausentes no ambiente do PR e nenhum arquivo .env local. Sem commit/push.
