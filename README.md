# Prioridades do Residencial

Portal para a GS2 de CitizenTech da FIAP: **publicar → participar → encerrar → dar retorno**. A gestão consulta as residências sobre eventos e melhorias; moradores acompanham o resultado e os próximos passos. As consultas orientam a decisão da gestão. **Residencial Horizonte é fictício. Os cenários, acessos, valores e participações da apresentação são demonstrativos.**

## Abrir no Mac

Requer Python 3.9 ou superior, sem bibliotecas adicionais.

```sh
cd ~/Downloads/PR-GlobalSolution
python3 demo.py
```

Abra http://127.0.0.1:8000. Mantenha o Terminal aberto; encerre com Control+C. Se a porta estiver ocupada:

```sh
RESIDENCIAL_PORT=8001 python3 demo.py
```

Nesse caso, abra http://127.0.0.1:8001.

| Perfil | Residência fictícia | Código inicial |
| --- | --- | --- |
| Morador | DEMO-01 | `demo-morador-1` |
| Morador | DEMO-02 | `demo-morador-2` |
| Gestão | — | `demo-gestao` |

O perfil é reconhecido pelo código. Códigos substituídos continuam revogados após reiniciar. Guarde o novo código mostrado pela gestão; para gerar outro, reutilize **exatamente o mesmo identificador da residência**.

## Telas e navegação

- **Consultas do residencial:** cartões com contexto breve, status, prazo e ação conforme o estado: Responder, Acompanhar consulta ou Ver resultado e retorno. Os formulários ficam apenas no detalhe. No perfil da gestão, a lista apresenta as tarefas de criar consulta, gerenciar convites e abrir o gerenciamento de cada assunto.
- **Detalhe de uma consulta:** contexto, prazo, custo e impactos antes das perguntas. As opções têm a linha toda clicável. Após o envio, há confirmação e orientação sobre o resultado. Enquanto aberta, a consulta exibe Aberta ou Participação registrada; não recebe o rótulo de encaminhamento pendente.
- **Acompanhamento:** somente consultas encerradas, agrupadas em aguardando devolutiva, em acompanhamento e concluídas. Área responsável e próxima atualização aparecem quando informadas.
- **Resultado e retorno:** contagem por opção e total de participações após encerrar. A decisão, o próximo passo, a área responsável e a data do próximo retorno ficam em destaque. A previsão de conclusão é separada e pode ficar A definir. Ausência de devolutiva tem mensagem explícita.
- **Gestão:** telas próprias para criar consulta e gerenciar convites. O detalhe da consulta aberta oferece encerramento com explicação e confirmação; a encerrada oferece publicação/atualização da devolutiva e confirma que ficou disponível para os moradores.
- **Regras e contatos:** tela própria, com canais por assunto primeiro, documentos do residencial depois e referências gerais ao final. Documentos indisponíveis exibem Aguardando publicação. Os contatos ficam A informar; nenhum dado pessoal é publicado.

A navegação usa endereços simples como `#consultas`, `#consulta/2`, `#acompanhamento` e `#regras`. Voltar/avançar do navegador funciona entre telas. O código continua apenas em memória: **recarregar exige entrar novamente e retoma o endereço aberto**. Sair limpa o acesso e volta para a lista. Endereços de consulta inexistente mostram uma orientação; moradores não acessam tarefas da gestão.

Identidade baseada nos dois PNGs disponíveis em `wireframes/`: azul-marinho, branco, azul-bebê e laranja suave, foco visível e organização em uma coluna no celular. Não há outro wireframe comercial na pasta; a página inicial fornecida orienta a identidade, sem acrescentar uma página comercial nesta etapa.

## Roteiro de demonstração

A nova base `demo-gs2.sqlite3` inicia com três consultas:

| Consulta | Estado inicial | O que mostrar |
| --- | --- | --- |
| Formato e decoração de um evento | Aberta | Três perguntas separadas; duração inclui Não se aplica |
| Calendário anual de eventos | Encerrada, aguardando devolutiva | Contagem com duas participações fictícias e ausência de retorno |
| Melhorias da área comum | Encerrada, retorno publicado | Decisão, próximo passo, Administração e próxima atualização |

As duas consultas encerradas têm respostas fictícias das residências DEMO-01 e DEMO-02. A consulta aberta ainda não tem respostas. Datas são definidas na criação dessa base e ficam preservadas nos reinícios.

1. Entre como `demo-morador-1`. Observe a lista compacta, abra a consulta de decoração e responda. A confirmação substitui o formulário; a contagem continua oculta.
2. Volte à lista: a ação mudou para Acompanhar consulta. Saia, entre como `demo-morador-2` e responda à mesma consulta.
3. Entre como `demo-gestao`. Abra a consulta e clique em Encerrar consulta. Leia a explicação e confirme; confira as duas participações e a contagem por opção.
4. Publique a decisão, o próximo passo, o responsável e as duas datas. O painel confirma a disponibilidade para os moradores. A devolutiva pode ser atualizada depois.
5. Volte como morador. Veja o resultado e o retorno no detalhe e no Acompanhamento. Pare e reinicie o servidor: os dados continuam salvos.
6. Como gestão, use Gerenciar convites e gere outro código para DEMO-01. O código antigo perde acesso; com o novo, a participação permanece registrada.
7. Para repetir o ciclo sem esbarrar nas respostas anteriores, crie uma nova consulta pelo painel da gestão. Também é possível usar uma base nova separada, conforme abaixo.

## Preservação das bases anteriores

**Esta versão usa `demo-gs2.sqlite3` por padrão, separada da antiga `demo.sqlite3` e de `residencial.sqlite3`.** Não apague a base antiga. Nenhuma consulta usada anteriormente é encerrada, reaberta ou reescrita para preparar os cenários da apresentação.

Para abrir dados anteriores na interface refinada:

```sh
RESIDENCIAL_DB=demo.sqlite3 python3 demo.py
```

A inicialização faz somente as migrações compatíveis necessárias. A preparação dos cenários é executada **apenas se não houver nenhuma consulta** na base escolhida. Reiniciar não gera consultas novas, não restaura respostas e não reativa códigos antigos. Consultas já existentes mantêm suas perguntas e a ordem das opções: a nova opção Não se aplica está nas novas demonstrações, sem mudar o significado de votos antigos.

O campo `next_step` é adicionado ao banco sem substituir `response`, que continua contendo a decisão/devolutiva anterior. Campos ainda não preenchidos aparecem como A informar. A migração foi testada numa cópia SQLite, verificando que a origem permaneceu intacta e que a cópia preservou decisão e votos.

Se a base vier da primeira versão do protótipo, cada convite antigo recebe uma residência legada, pois a unidade não era registrada. Convites diferentes não podem ser automaticamente reconhecidos como pertencentes à mesma residência.

Antes de atualizar uma base relevante, pare o servidor e copie o arquivo SQLite como backup. Para uma apresentação nova sem mexer nas anteriores:

```sh
RESIDENCIAL_DB=/tmp/pr-apresentacao-nova.sqlite3 python3 demo.py
```

Esse arquivo também persiste entre execuções; para outra apresentação limpa, escolha outro nome. Para uma instalação vazia, use `python3 server.py`: o Terminal mostra a chave temporária da gestão. `RESIDENCIAL_ADMIN` mantém uma chave definida entre reinícios e `RESIDENCIAL_NOME` define o nome do residencial.

## Regras implementadas e arquitetura

HTML/CSS/JavaScript, API HTTP em Python e SQLite. Nenhuma dependência foi adicionada à aplicação.

- Cadastro de residência apenas por identificador, sem nome, CPF, telefone ou endereço. Um código ativo por residência, armazenado como hash.
- Uma participação por residência por consulta, validada no servidor e por índice único no banco. Trocar código ou navegador não permite outro voto.
- Perfis separados: morador não cria/encerra consultas, não gera convites nem publica devolutivas; gestão não vota.
- Uma a seis perguntas, duas a seis opções por pergunta, uma opção por pergunta. Prazo, custo e impactos opcionais. Prazo publicado encerra a aceitação de respostas ao fim desse dia conforme o relógio do servidor; a gestão encerra a consulta para liberar a contagem.
- Resultados indisponíveis na API enquanto a consulta está aberta, inclusive para a gestão. Uma consulta encerrada rejeita novas participações. Votação, rotação e encerramento usam transações; o código é revalidado dentro da transação.
- Encaminhamento persistente com decisão, próximo passo, status, área responsável, próximo retorno e previsão de conclusão. Próximo retorno é a próxima atualização; conclusão é a previsão de finalizar o assunto.
- Referências oficiais preservadas do portal da Câmara dos Deputados, conferidas em 10/11/2026. Título, fonte e data da norma aparecem na interface. O catálogo de referências e documentos continua estático em `resources()` no arquivo `public/app.js`.

O protótipo escuta só em `127.0.0.1` por padrão. Quem acessa o banco pode relacionar respostas à residência; não há promessa de anonimato. Uso pela internet exigiria HTTPS, autenticação individual da gestão, controle de tentativas, expiração, backups, auditoria e política de retenção. Cada instalação representa um único residencial.

## Verificação

```sh
python3 -m unittest discover -s tests -v
node --check public/app.js
```

Os testes usam bancos temporários e portas locais dinâmicas. Cobrem permissões, duas residências, rotação, duplicidade, fechamento, ocultação/contagem dos resultados, validação de datas, prazo vencido, persistência após reiniciar o HTTP, índices do banco, migração repetível numa cópia e preservação dos cenários já utilizados.

Para repetir o teste opcional de navegador (requer Node.js, que não é necessário para rodar a aplicação):

```sh
npm install --prefix /tmp/residencial-browser playwright --no-audit --no-fund
/tmp/residencial-browser/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/residencial-browser/node_modules node tests/ui.cjs
```

`PR_BROWSER=/caminho/do/chromium` seleciona um navegador já instalado. O teste cria/remove sua base temporária e para seu servidor local. Capturas ficam em `docs/screenshots/`. A verificação de navegador usa larguras de 375 e 1280 px; não substitui teste em celular físico ou com leitor de tela.

## Evoluções ainda não implementadas

- **Captação e apresentação comercial:** página pública, adesão de residenciais e contratação, mantendo o portal como área de participação.
- **WhatsApp:** link direto à consulta compartilhada, mantendo autenticação e uma participação por residência. Nenhum envio foi configurado.
- **Orçamento e reservas:** saldo informado pela gestão, data de referência e valores comprometidos, quando disponíveis.
- **Solicitações privadas:** protocolo, responsável, histórico, status e prazo de retorno, com acesso restrito ao solicitante e à equipe autorizada.
- **Relatório mensal de IA:** temas recorrentes em solicitações e sugestões, com propostas de enquetes, reuniões ou ações junto às áreas responsáveis. Cada sugestão deverá apresentar sua base, trabalhar com dados agregados e passar por revisão humana antes de qualquer envio. Nenhum serviço de IA foi conectado.

O trabalho é local. Não há publicação na internet, envio de mensagens ou integração externa de IA.

## Entrega acadêmica

Complemente com evidências do problema observado, diagrama de arquitetura e justificativa das tecnologias e do ODS 11. Use apenas dados fictícios na apresentação.
