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

## Interface do sistema: gestor e morador

A versão atual está na branch local **`interface-sistema`**, baseada em `painel-gestao`. A navegação lateral agora é usada pelos **dois perfis**, com ferramentas e permissões diferentes. O menu de categorias não fica mais no topo depois de entrar. O cabeçalho superior é compacto e mostra somente a seção e o perfil. No celular, o botão **Menu** abre a navegação; escolher uma seção fecha o menu e leva o foco ao conteúdo.

- **Morador:** entra em **Início**, com resumo da residência, consultas abertas e o guia **Como usar o sistema**. O menu contém Início, Consultas, Acompanhamento, Minhas solicitações e Regras e contatos. O guia explica como votar, consultar decisões, pedir a limpeza da academia e encontrar documentos/canais, com atalhos reais para essas telas. O botão **Como usar o sistema**, no rodapé do menu, retorna às orientações.
- **Gestor:** entra em **Visão geral**, com indicadores, pendências e um guia permanente sobre criar consultas, convidar moradores e publicar o retorno. O menu mantém Visão geral, Consultas, Devolutivas, Convites e Fila de limpeza. O tour continua disponível em **Como usar o painel**.
- **Entrada no sistema:** mantém o visual anterior, com “Sua opinião conta. O retorno também.” e os passos Consulte, Participe e Acompanhe. As novas orientações por perfil aparecem depois de entrar.

Para abrir esta versão no Mac:

```sh
cd ~/Downloads/PR-GlobalSolution
git switch interface-sistema
python3 demo.py
```

Abra http://127.0.0.1:8000, recarregue com **⌘R** se já estava aberto e entre com `demo-morador-1` ou `demo-gestao`. Para testar a tela inicial correspondente, use o endereço sem fragmento (`#...`) ou saia e entre novamente. Links diretos às consultas e outras seções continuam válidos após autenticar.

Não houve alteração do backend, das permissões ou do schema SQLite. As solicitações continuam privadas por residência e os registros existentes são preservados. A mudança usa `renderSystemShell()`, `residentHome()` e `usageGuide()` em `public/app.js`, com estilos compartilhados para os perfis autenticados em `public/style.css`.

## Painel administrativo da gestão

A interface administrativa foi criada na branch **`painel-gestao`**, baseada em `automacao-limpeza`, e também está disponível na versão atual **`interface-sistema`**. As branches anteriores mantêm seus commits; `main` continua na versão publicada da GS2. Nenhuma migração ou alteração das permissões do servidor foi necessária para esta interface.

```sh
cd ~/Downloads/PR-GlobalSolution
git switch interface-sistema
python3 demo.py
```

Abra http://127.0.0.1:8000/#visao-geral e entre com **`demo-gestao`**. Se um servidor desta pasta já estiver aberto, recarregue a página com **⌘R** para carregar os novos arquivos. Para continuar usando uma base anterior, mantenha `RESIDENCIAL_DB` apontando para o mesmo arquivo; não apague o banco. Para uma apresentação isolada, use `RESIDENCIAL_DB=/tmp/pr-painel-demo.sqlite3 python3 demo.py`.

- **Visão geral:** tela inicial da gestão quando o login não tem um endereço específico. Mostra consultas abertas, consultas encerradas sem devolutiva e retornos publicados. “Precisa de atenção” traz primeiro ordens de limpeza pendentes, depois consultas que aguardam decisão. Cada pendência leva à ação real. Quando não há itens, mostra “Nenhuma pendência no momento”. “Atualizar painel” busca os dados atuais.
- **Consultas:** criação, listagem e gerenciamento das consultas existentes. O encerramento continua exigindo confirmação.
- **Devolutivas:** consultas encerradas e seus encaminhamentos; abra uma para publicar decisão, próximo passo, responsável e datas.
- **Convites:** cadastro de residência e geração/substituição do código de acesso, preservando suas participações.
- **Fila de limpeza:** as ordens já implementadas, com abertura e conclusão pela gestão.

No desktop, o menu fica na lateral esquerda com a seção ativa em azul-bebê. No celular, use **Menu**; escolher uma seção fecha a navegação e leva o foco ao conteúdo. Esc fecha o menu e retorna o foco ao botão Menu. Ao reduzir uma janela desktop, o foco também é levado ao Menu se o controle da sidebar ficar oculto. O nome do residencial aparece no topo da barra; **Como usar o painel** e **Sair** ficam no rodapé.

### Boas-vindas e tour

No primeiro login da gestão neste navegador, aparece “Boas-vindas ao painel da gestão”, com o texto de orientação e os controles **Fazer tour**, **Agora não** e fechar. O tour mostra três passos: **Visão geral**, **Criar consulta** e **Devolutivas**, com progresso, avanço, retorno e fechamento por botão ou Esc. Ao fechar, o foco volta ao ponto de origem. No celular, as instruções ficam na parte inferior, separadas do elemento destacado. Se um alvo estiver ausente, a explicação e os controles continuam funcionando.

Somente a preferência `pr-gestao-introducao=dispensada` é guardada no `localStorage`. Código de acesso, dados da residência e progresso do tour não são gravados no navegador. Se o navegador bloquear armazenamento, o painel e o descarte da introdução continuam funcionando; a preferência pode não persistir. A orientação pode ser reaberta a qualquer momento por **Como usar o painel**. Para conferir a apresentação automática de primeiro acesso sem mudar sua preferência atual, use uma janela anônima.

O tour apresenta as ações; não cria, encerra ou publica consultas. **Cada perfil tem seu próprio menu lateral**: o morador não recebe as opções, os indicadores administrativos ou o tour da gestão. Endereços diretos para as seções existentes continuam válidos e são retomados após autenticar.

Arquivos principais: `public/index.html` contém o cabeçalho compacto e o diálogo; `public/app.js` monta `renderSystemShell()`, `adminOverview()` e o tour em `showAdminIntro()` / `renderAdminIntro()`; `public/style.css` compartilha a estrutura lateral entre os perfis, mantendo as opções administrativas restritas à gestão. O teste completo está em `tests/gestao-ui.cjs`. Os prints da Meta mencionados no pedido não estavam disponíveis na pasta; a disposição segue os requisitos descritos e a identidade visual do projeto.

## Automação local: higiene da academia → ordem de limpeza

A automação foi implementada na branch **`automacao-limpeza`** e também está disponível em **`painel-gestao`** e **`interface-sistema`**, com solicitações privadas por residência e a fila de limpeza da gestão. A branch `main` mantém a versão publicada da GS2. Esta etapa é local; não configura prazos, alertas, WhatsApp ou agenda externa.

Para demonstrar no Mac com uma base separada das consultas já utilizadas:

```sh
cd ~/Downloads/PR-GlobalSolution
git switch interface-sistema
RESIDENCIAL_DB=/tmp/pr-limpeza-demo.sqlite3 python3 demo.py
```

Abra http://127.0.0.1:8000. Se precisar de outra porta, acrescente `RESIDENCIAL_PORT=8001` antes de `python3 demo.py` e abra a porta correspondente. O arquivo informado persiste entre execuções; escolha outro nome para uma nova demonstração limpa. Não apague bancos existentes.

1. Entre com **`demo-morador-1`**, abra **Minhas solicitações** e escreva **Os aparelhos da academia estão sujos**. Local Academia e categoria Higiene ficam visíveis e não editáveis neste caso inicial.
2. Clique em **Enviar solicitação**. Anote o protocolo `SOL-…`: a solicitação aparece como **Pendente**, e a mensagem confirma que a ordem de limpeza foi criada automaticamente.
3. Saia e entre com **`demo-gestao`**. Em **Fila de limpeza**, encontre o mesmo protocolo, local, descrição e data de abertura. Clique em **Abrir tarefa**.
4. Em **O que foi feito?**, escreva **Aparelhos higienizados** e clique em **Confirmar conclusão**. A tarefa passa a **Concluída**, com devolutiva e data de conclusão.
5. Volte como **`demo-morador-1`** e abra **Minhas solicitações**: o mesmo protocolo mostra **Concluída** e **Aparelhos higienizados**. O botão **Atualizar solicitações** busca as mudanças sem precisar sair do portal.
6. Entre com **`demo-morador-2`**: a solicitação da primeira residência não aparece. O isolamento vale também ao tentar acessar o protocolo diretamente pela API.
7. Pare com Control+C e rode o mesmo comando novamente: o protocolo e a devolutiva continuam salvos. As telas de Consultas, Acompanhamento, gestão de convites e regras continuam disponíveis.

Use apenas informações fictícias e não inclua dados pessoais na descrição. Uma solicitação gera uma ordem; a pessoa pode abrir mais de uma solicitação. Esta etapa não tenta agrupar pedidos semelhantes. Uma ordem concluída não pode ser concluída de novo nem ter seu retorno sobrescrito por outra conclusão.

### Onde está a automação no código

| Papel | Arquivo e função | O que acontece |
| --- | --- | --- |
| Gatilho na interface | `public/app.js` → `requestsPage()` | O envio chama `api('/api/requests', ...)` com local, categoria e descrição. Não cria a ordem no navegador. |
| Entrada autenticada | `server.py` → `Handler.api()` e `Handler.mutate()` | Valida o código ativo, inicia a transação, identifica a residência e trata o POST. A residência vem do acesso, não de um campo enviado pelo usuário. |
| Regra de encaminhamento | `encaminhamento.py` → `identificar_equipe(local, categoria)` | Remove espaços, ignora diferenças entre maiúsculas/minúsculas e retorna **Equipe de limpeza** apenas para Academia + Higiene. |
| Gravação automática | `solicitacoes.py` → `criar_solicitacao()` | Valida os dados, aplica a regra, gera o protocolo e faz os dois INSERTs: `service_requests` e `work_orders`. A ordem nasce Pendente. |
| Confirmação ou rollback | `server.py` → `Handler.api()` | O bloco `with db` com `BEGIN IMMEDIATE` confirma ambos os INSERTs juntos. Se uma gravação falhar, reverte toda a operação e informa o erro. |
| Lista privada | `solicitacoes.py` → `listar_solicitacoes()` | O SQL filtra a residência autenticada, inclusive na consulta de um único protocolo. |
| Fila e conclusão | `solicitacoes.py` → `listar_fila_limpeza()` e `concluir_ordem()` | A gestão lista as ordens e grava status, devolutiva e data no mesmo UPDATE, dentro da transação do servidor. |
| Telas de atendimento | `public/app.js` → `cleaningQueue()`, `cleaningDetail()` e `serviceCard()` | Mostram a fila, a conclusão e o retorno. Ambas as telas leem o mesmo estado persistido. |

**Por que o status fica em uma única tabela?** `service_requests` guarda protocolo, residência, local, categoria, descrição e abertura. `work_orders` guarda o vínculo único com a solicitação, equipe, status, devolutiva e conclusão. Um JOIN reúne esses dados para morador e gestão; não existem duas cópias de status que possam divergir. O banco exige que uma ordem Concluída tenha devolutiva e data, e que uma Pendente não tenha esses campos preenchidos.

As tabelas são acrescentadas por `solicitacoes.criar_tabelas()`, chamada dentro da migração transacional de `server.init()`. Nenhuma consulta, pergunta, participação ou devolutiva da GS2 é apagada ou modificada. O teste de migração usa uma cópia de uma base com o schema anterior e confere que os registros antigos continuam iguais.

Endpoints da automação:

| Método e caminho | Perfil | Ação |
| --- | --- | --- |
| `POST /api/requests` | Morador | Criar solicitação e ordem automaticamente |
| `GET /api/requests` | Morador | Listar apenas a própria residência |
| `GET /api/requests/SOL-…` | Morador | Consultar protocolo da própria residência; outro retorna 404 |
| `GET /api/cleaning` | Gestão | Listar fila de limpeza |
| `GET /api/cleaning/SOL-…` | Gestão | Consultar uma tarefa |
| `POST /api/cleaning/SOL-…/complete` | Gestão | Concluir com devolutiva |

O servidor rejeita ações de gestão feitas por morador, códigos inválidos/revogados, descrição vazia ou acima de 1500 caracteres e locais/categorias fora do caso inicial. A troca do código preserva o acesso aos protocolos da residência. Campos extras enviados pelo cliente não mudam residência, equipe ou status.

## Telas e navegação

- **Consultas do residencial:** cartões com contexto breve, status, prazo e ação conforme o estado: Responder, Acompanhar consulta ou Ver resultado e retorno. Os formulários ficam apenas no detalhe. No perfil da gestão, a sidebar leva à Visão geral e às telas de Consultas, Devolutivas, Convites e Fila de limpeza.
- **Detalhe de uma consulta:** contexto, prazo, custo e impactos antes das perguntas. As opções têm a linha toda clicável. Após o envio, há confirmação e orientação sobre o resultado. Enquanto aberta, a consulta exibe Aberta ou Participação registrada; não recebe o rótulo de encaminhamento pendente.
- **Acompanhamento:** somente consultas encerradas, agrupadas em aguardando devolutiva, em acompanhamento e concluídas. Área responsável e próxima atualização aparecem quando informadas.
- **Resultado e retorno:** contagem por opção e total de participações após encerrar. A decisão, o próximo passo, a área responsável e a data do próximo retorno ficam em destaque. A previsão de conclusão é separada e pode ficar A definir. Ausência de devolutiva tem mensagem explícita.
- **Gestão:** telas próprias para criar consulta e gerenciar convites. O detalhe da consulta aberta oferece encerramento com explicação e confirmação; a encerrada oferece publicação/atualização da devolutiva e confirma que ficou disponível para os moradores.
- **Regras e contatos:** tela própria, com canais por assunto primeiro, documentos do residencial depois e referências gerais ao final. Documentos indisponíveis exibem Aguardando publicação. Os contatos ficam A informar; nenhum dado pessoal é publicado.

A navegação usa endereços simples como `#inicio`, `#visao-geral`, `#consultas`, `#consulta/2`, `#acompanhamento` e `#regras`. Voltar/avançar do navegador funciona entre telas. O código continua apenas em memória: **recarregar exige entrar novamente e retoma o endereço aberto**. Sair limpa o acesso e volta à tela de entrada; um novo login sem endereço específico abre a tela inicial do perfil. Endereços de consulta inexistente mostram uma orientação; moradores não acessam tarefas da gestão.

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
NODE_PATH=/tmp/residencial-browser/node_modules node tests/limpeza-ui.cjs
NODE_PATH=/tmp/residencial-browser/node_modules node tests/gestao-ui.cjs
NODE_PATH=/tmp/residencial-browser/node_modules node tests/sistema-ui.cjs
```

`PR_BROWSER=/caminho/do/chromium` seleciona um navegador já instalado. O teste cria/remove sua base temporária e para seu servidor local. Capturas ficam em `docs/screenshots/`. A verificação de navegador usa larguras de 375 e 1280 px; não substitui teste em celular físico ou com leitor de tela.

A suíte Python inclui a automação em `tests/test_solicitacoes.py`: criação vinculada, privacidade por residência, código substituído, validação de dados, conclusão, persistência e migração em cópia. Dois testes provocam falhas reais por triggers SQLite para provar rollback na criação da ordem e na conclusão. `tests/limpeza-ui.cjs` verifica no navegador o roteiro descrito acima, o isolamento do segundo morador, reinício e votação GS2 na mesma base. `tests/gestao-ui.cjs` confere a sidebar, a visão geral com dados reais da base de teste, o estado vazio, criação/encerramento/devolutiva, convites, fila, menu móvel e foco. Também verifica o tour (abrir, dispensar, reabrir, avançar, voltar, Esc), ausência de sobreposição no celular (375 × 812 e 375 × 568), foco após redimensionar, armazenamento bloqueado, alvo ausente e morador sem área administrativa. `tests/sistema-ui.cjs` confere a barra lateral e os guias dos dois perfis, a nova tela Início, atalhos, menu móvel, foco e saída. Os quatro testes de navegador usam bases temporárias próprias.

## Evoluções ainda não implementadas

- **Captação e apresentação comercial:** página pública, adesão de residenciais e contratação, mantendo o portal como área de participação.
- **WhatsApp:** link direto à consulta compartilhada, mantendo autenticação e uma participação por residência. Nenhum envio foi configurado.
- **Orçamento e reservas:** saldo informado pela gestão, data de referência e valores comprometidos, quando disponíveis.
- **Evolução das solicitações privadas:** o caso de higiene da academia já funciona com protocolo, equipe, status e devolutiva. Ficam para depois outros locais/categorias, histórico de alterações, prazos de retorno, alertas e integração com agenda externa.
- **Relatório mensal de IA:** temas recorrentes em solicitações e sugestões, com propostas de enquetes, reuniões ou ações junto às áreas responsáveis. Cada sugestão deverá apresentar sua base, trabalhar com dados agregados e passar por revisão humana antes de qualquer envio. Nenhum serviço de IA foi conectado.

O trabalho é local. Não há publicação na internet, envio de mensagens ou integração externa de IA.

## Entrega acadêmica

Complemente com evidências do problema observado, diagrama de arquitetura e justificativa das tecnologias e do ODS 11. Use apenas dados fictícios na apresentação.
