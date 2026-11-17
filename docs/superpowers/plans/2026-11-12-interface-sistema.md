# Interface de sistema para os dois perfis

Pedido: substituir categorias do topo por navegação à esquerda e ensinar gestor/morador na página inicial. Usar sidebar da gestão existente como estrutura compartilhada; manter menus e permissões distintos. Sem API nova ou alteração de banco.

Branch local interface-sistema baseada em painel-gestao, preservando as anteriores. Login com orientação por perfil; Início do morador com guia e atalhos reais; Visão geral da gestão com guia permanente além do tour existente. Navegação móvel com Menu, Esc e foco no conteúdo.

- [x] Escrever teste real de sidebar e guias dos dois perfis e observar falha antes da implementação.
- [x] Generalizar shell/menu responsivo para perfis autenticados, sem conceder funções da gestão ao morador.
- [x] Criar Início do morador e guias permanentes por perfil; orientar também a entrada no sistema.
- [x] Adaptar os roteiros existentes ao menu lateral do morador e verificar consultas, devolutivas e limpeza em bases temporárias.
- [x] Conferir 375/1280, teclado, retorno de foco e ausência de overflow; atualizar README, capturas e revisar.

Fora do escopo: novos recursos de backend, migrações, publicação e envio ao GitHub.


Verificação: teste novo observou falha pela ausência de Início antes da implementação; depois passou no Chromium. Quatro roteiros UI passaram: sistema, GS2, limpeza e painel/tour. Larguras 375/1280, foco/teclado, links reais e perfis separados verificados; 12 testes Python passaram. Revisão independente não encontrou problema importante; texto de saída no README corrigido. Nenhum arquivo de backend/schema foi alterado; todos os testes usaram bancos temporários. Sem push ou publicação.
