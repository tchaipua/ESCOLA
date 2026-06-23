# UI_PATTERNS

## Objetivo

Centralizar os padroes visuais e funcionais ja aprovados no produto para:

- reaproveitar no sistema atual
- servir de base para novos sistemas
- evitar que decisoes de UX fiquem apenas "na memoria"
- acelerar handoff entre IA, produto e desenvolvimento

## Regra de manutencao

Todo padrao novo aprovado deve atualizar, no mesmo ciclo:

1. este arquivo
2. `UI_PATTERN_CHANGELOG.md`
3. o componente compartilhado correspondente, quando existir
4. `frontend/src/app/lib/ui-standards.ts`, quando o padrao entrar no mapa tecnico

## Hierarquia de uso

1. regra de negocio do modulo
2. componente compartilhado existente
3. padrao oficial desta documentacao
4. implementacao local somente quando nao houver shared component

## Principios visuais aprovados

- cabecalhos importantes com identidade da escola quando fizer sentido
- rodapes de acao fixos em modais extensos
- areas de rolagem isoladas no conteudo, nunca no cabecalho/rodape principal
- foco visual em operacoes principais
- grids com exportacao, ordenacao, configuracao de colunas e filtro de status
- popups/detalhes com leitura mais aberta e menos barra de rolagem
- persistencia por usuario nas configuracoes de grid/exportacao

## Padroes oficiais atuais

### PAT-001 - Grid administrativo padrao

- cabecalho da listagem com busca e acoes principais
- ordenacao clicando no cabecalho da coluna
- botao `EXPORTAR`
- configuracao de colunas separada do grid
- exportacao respeitando apenas registros visiveis da tela
- a definicao base de colunas da tela e a fonte oficial para:
  - configurador de colunas
  - lista de campos disponiveis no export
- sempre que um campo novo entrar na definicao oficial da grid, ele deve ficar disponivel automaticamente:
  - na selecao de colunas do grid
  - na selecao de campos do export
- a configuracao do grid e a configuracao do export continuam independentes:
  - o campo pode existir nos dois lugares
  - mas estar visivel no grid e sair no export sao escolhas separadas do usuario
- rodape visual padrao:
  - esquerda: `COLUNAS`
  - centro: semaforo horizontal de status
  - direita: total de registros exibidos

Componentes base:

- `frontend/src/app/components/grid-sortable-header.tsx`
- `frontend/src/app/components/grid-footer-controls.tsx`
- `frontend/src/app/components/grid-status-filter.tsx`

Telas referencia:

- `dashboard/professores`
- `dashboard/alunos`
- `dashboard/responsaveis`

### PAT-002 - Configuracao de colunas do grid

- modal com cabecalho fixo
- lista de colunas com rolagem propria
- colunas ativas primeiro, inativas depois
- acao visual por botao redondo:
  - verde com `check` = em uso
  - vermelho com `x` = fora do grid
- reordenacao por arrastar
- topo fixo com:
  - esquerda: `RESTAURAR PADRAO`
  - direita: `SALVAR / FECHAR CONFIGURACAO`

Componente base:

- `frontend/src/app/components/grid-column-config-modal.tsx`

### PAT-003 - Exportacao padrao de grid

- modal de exportacao com cabecalho fixo
- formatos:
  - Excel
  - CSV
  - PDF
  - JSON
  - TXT
- campos ativos primeiro, inativos depois
- controle redondo menor:
  - verde com `check` = exporta
  - vermelho com `x` = nao exporta
- reordenacao por arrastar
- configuracao da exportacao separada da configuracao do grid
- memoria por usuario e por tela
- os campos disponiveis no export devem nascer da mesma definicao base da grid
- campos novos aprovados para a tela nao devem precisar de cadastro duplicado para aparecer no export
- o que muda entre grid e export e a selecao do usuario, nao a disponibilidade base do campo

Componente base:

- `frontend/src/app/components/grid-export-modal.tsx`

### PAT-004 - Exportacao PDF institucional

- logo e nome da escola no cabecalho
- total de registros impressos no final
- sem lista de parametros escolhidos no topo
- etapa propria de configuracao do PDF
- configuracoes persistidas por usuario e por tela
- modo especial sem cabecalho com descricao a esquerda do campo

Implementacao base:

- `frontend/src/app/lib/grid-export-utils.ts`

### PAT-005 - Exportacao Excel institucional

- arquivo `.xlsx` real
- logo e nome da escola no topo
- topo congelado
- uma linha por registro
- largura de coluna baseada no maior conteudo real do campo
- total de registros somente no rodape final da planilha

Implementacao base:

- `frontend/src/app/lib/grid-export-utils.ts`

### PAT-006 - Detalhes do registro via popup

- substituir popover estreito por popup/modal centralizado
- usar logo/foto do registro ou logo da escola como fallback
- evitar tags redundantes no topo
- organizar campos em ate 3 colunas para reduzir rolagem
- botao explicito de fechar

Componente base:

- `frontend/src/app/components/grid-record-popover.tsx`

### PAT-007 - Cadastro em abas com rodape fixo

- cabecalho com titulo forte
- abas em linha superior
- conteudo rolavel
- rodape de acoes fixo
- logo da escola quando o contexto for da escola logada

Tela referencia:

- `dashboard/professores`

### PAT-008 - Acessos especiais da escola

- fluxo em modo focado
- lista limpa de usuarios
- formulario isolado na inclusao/edicao
- perfis principais administrativos:
  - `ADMIN`
  - `SECRETARIA`
  - `COORDENACAO`
- perfis complementares:
  - `FINANCEIRO`
  - `CAIXA`
- permissao abre em tela propria por acao explicita

Tela referencia:

- `msinfor-admin/components/tenant-access-manager.tsx`

### PAT-009 - Configuracoes globais da softhouse

- modulo global independente da escola
- tela por abas
- campos sensiveis sem uppercase forcado
- teste de comunicacao com popup obrigatorio para fechar
- uso do logo institucional da tela de login da softhouse

Tela referencia:

- `msinfor-admin/components/global-settings-modal.tsx`

### PAT-010 - Acoes de status no grid

- a ultima acao da linha deve refletir o estado atual do registro
- registro ativo:
  - mostrar apenas `INATIVAR`
  - usar botao compacto com icone de `x`
- registro inativo:
  - mostrar apenas `ATIVAR`
  - usar botao compacto com icone de `check`
- nao exibir ao mesmo tempo `ATIVAR` e `INATIVAR`
- status visual da grid deve usar icone com tooltip em uppercase:
  - `ATIVO` com icone de `check`
  - `INATIVO` com icone de `x`
- aplicar o mesmo indicador na descricao principal da linha e na coluna `Status do cadastro`
- o mesmo principio vale para grids principais do dashboard antes de qualquer variacao local

Componentes/Telas base:

- `frontend/src/app/components/grid-row-action-icon-button.tsx`
- `frontend/src/app/components/record-status-indicator.tsx`
- `dashboard/disciplinas`
- `dashboard/professores`
- `dashboard/alunos`
- `dashboard/responsaveis`

### PAT-011 - Popup de confirmação com identidade escolar

- **Contexto**: sempre que uma ação de status (`ATIVAR` / `INATIVAR`) for exibida em uma grade administrativa (disciplinas, mensalidades, acessos, cadastros sensíveis), a confirmação deve acontecer em um modal dedicado e não em `window.confirm`.
- **Comportamento**:
  - o modal bloqueia o fundo com um `backdrop` escuro e traz o conteúdo para o centro, mantendo a linguagem tipográfica em uppercase nos botões de ação.
  - o cabeçalho inclui o logotipo (ou iniciais geradas a partir do nome da escola) fornecido por `tenantBranding`.
  - o corpo destaca o registro afetado (nome) e exibe a mudança de status com o `RecordStatusIndicator`, além de um texto que explica o impacto da ativação/inativação.
  - os botões exibem cores distintas: `rosa claro` para cancelar e `verde/rosa` saturados para confirmar, sempre com `tracking` amplo.
  - o botão de confirmar inclui o texto `Confirmar ativação` ou `Confirmar inativação` e fica desabilitado enquanto a chamada está em progresso.
  - o padrão pode ser reutilizado para confirmações de status em outros módulos (mensalidades, professores, responsaveis, usuários, etc.).
- **Componentes/Telas**:
  - `frontend/src/app/dashboard/disciplinas/page.tsx`
- padrão aplicável a qualquer grid com ações de status confirmadas pelo usuário.

### PAT-012 - Identificador padronizado e “Fechar” em modais principais

- **Contexto**: garantir rastreabilidade e consistência visual em todas as telas administrativas (incluindo modais/popup) para manter histórico e facilitar auditoria.
- **Comportamento obrigatório**:
  - toda tela, seja uma página inteira ou um modal/popup, deve ter um nome curto exclusivo exibido no rodapé, preferencialmente no canto inferior direito.
  - toda tela nova deve ter apenas um nome técnico visível por vez; telas embutidas devem ocultar identificadores internos para não duplicar o nome visível da tela hospedeira.
  - o nome técnico deve ser exclusivo, estável e não pode ser reutilizado por outra tela, rota, popup ou fluxo visual.
  - o nome exibido deve ter um botão de cópia ao lado, reutilizando o componente `ScreenNameCopy` para que o usuário consiga replicar o valor (`Ctrl+C`).
  - quando o layout do modal inclui um botão “Cancelar”, ele deve ser renomeado para “Fechar”, alinhado ao canto inferior esquerdo, com fundo vermelho, texto branco em uppercase e borda arredondada.
  - o rodapé permanece com ações principais à direita (como `Cadastrar`/`Salvar`) e o identificador no lado oposto para manter equilíbrio visual.
  - sempre que possível, o identificador e o botão de cópia devem respeitar o mesmo espaçamento e tipografia utilizados em `screen-name-copy.tsx`.
  - em telas de cancelamento/inativação o usuário precisa informar a senha de login antes de confirmar; o sistema mantém a confirmação válida por 5 minutos e só volta a pedir quando o período expirar, evitando solicitar repetidamente para a mesma sessão.
  - quando a senha for obrigatória e estiver em branco ou incorreta, o modal deve exibir um alerta em estilo “pop-up” (um bloco flutuante com borda, sombra e texto uppercase no canto superior) para reforçar o erro antes de prosseguir.
- **Componentes/Telas**:
  - `frontend/src/app/components/screen-name-copy.tsx`
- `frontend/src/app/components/status-confirmation-modal.tsx`
- modais/popup dos dashboards acadêmicos (`series`, `turmas`, `grade`, etc.)
- qualquer modal de confirmação ou formulário com ações de cancelamento/fechamento.

### PAT-013 - Popup institucional com logo da escola e identificador exclusivo

- todo popup/modal exibido no sistema deve trazer o logotipo da escola no cabeçalho quando houver contexto de tenant logado; esta regra e compartilhada entre `Escola` e `Financeiro`
- quando o popup tambem exibir foto, avatar ou icone do registro, o logotipo institucional continua obrigatorio e deve permanecer separado do avatar do registro
- o cabeçalho deve manter identidade visual forte e mensagem clara da situação
- todo novo popup/modal deve nascer por padrao ja seguindo esta estrutura, sem depender de ajuste posterior
- todo popup/modal deve exibir um nome exclusivo no canto inferior direito
- o nome exclusivo deve ser tecnico, estavel e nao pode ser reutilizado por outro popup
- o rodapé deve reservar uma linha exclusiva para o bloco `Tela:`
- abaixo de `Tela:`, o identificador exclusivo deve aparecer sozinho em uma linha dedicada
- o nome exclusivo deve ter um botão de cópia ao lado, reutilizando `ScreenNameCopy` ou o mesmo comportamento visual/funcional
- o botão de cópia deve permitir replicar o identificador com a mesma intenção de `Ctrl+C`
- ao acionar o bloco de copia/auditoria, o popup deve abrir a logica usada na tela com:
  - origem do arquivo
  - tabelas envolvidas
  - relacionamentos
  - filtros
  - ordenacao
  - SQL/base logica correspondente
- o bloco do identificador não deve dividir a mesma linha com os botões principais de ação do popup
- sempre que possível, os botões principais ficam em uma linha acima e o identificador fica isolado em uma linha abaixo, no canto inferior direito
- essa obrigatoriedade vale tambem para popups internos abertos a partir de outra tela ou de outro popup
- essa regra vale para mensagens de erro, bloqueio, confirmação e avisos operacionais
- a aplicação pode reutilizar o componente compartilhado existente e, quando preciso, criar um wrapper específico por tipo de popup

Componentes/Telas:

- `frontend/src/app/components/screen-name-copy.tsx`
- `frontend/src/app/lib/tenant-branding-cache.ts`
- `frontend/src/app/components/grid-record-popover.tsx`
- popups e modais do painel principal e demais módulos administrativos
- popups/modais internos do `Financeiro`, inclusive quando embutidos na `Escola`

### PAT-013.1 - Auditoria SQL em abas e com parametros reais

- a referencia visual aprovada para este modal e a auditoria da tela `PRINCIPAL_PROFESSORES`
- o cabecalho deve concentrar os controles principais:
  - esquerda: logotipo institucional, etiqueta `Auditoria SQL`, identificador tecnico e pill `ORIGEM: SISTEMA ...`
  - centro: seletor de abas `Outras informações` / `SQL`
  - direita: botoes textuais `Fechar` e `Copiar SQL` com o mesmo tamanho
- o botao `Copiar SQL` deve aparecer somente quando a aba `SQL` estiver ativa
- os botoes de acao nao devem ser repetidos no rodape do modal
- o path/origem tecnica do arquivo deve ficar abaixo do cabecalho em pill vermelha centralizada
- a janela de auditoria aberta pelo identificador tecnico deve separar o conteudo em duas abas:
  - `Outras informações`, aberta por padrao, contendo origem, tabelas, relacionamentos, metricas/campos exibidos, filtros aplicados, ordenacao e observacoes funcionais
  - `SQL`, contendo exclusivamente a consulta SQL/base logica copiavel
- a aba `SQL` nao deve misturar texto explicativo, nomes amigaveis ou comentarios que nao sejam uteis para executar/entender a consulta
- o botao `Copiar SQL` deve copiar somente o conteudo da aba `SQL`
- sempre que a tela possuir filtros visiveis, ordenacao, status, filial, periodo, busca digitada ou parametros derivados da sessao, a auditoria deve refletir os valores atuais do grid/lista no momento da abertura
- no SQL copiavel, parametros obrigatorios devem aparecer com o valor real quando possivel, especialmente `schoolId`/`tenantId`, `branchCode`, busca digitada, status e filtros selecionados
- para a Escola, o filtro de tenant deve ficar executavel no SQL, exemplo `WHERE T.tenantId = 'uuid-real-da-escola'`
- nomes humanos de apoio, como nome da escola ou nome da filial, devem aparecer na aba `Outras informações` entre parenteses ao lado do identificador tecnico, mas nao devem alterar a SQL executavel
- se algum parametro sensivel nao puder ser exibido, a auditoria deve declarar `NAO EXIBIDO POR SEGURANCA` e manter a consulta segura
- quando novos filtros forem adicionados a uma tela com grid/lista, o gerador de auditoria dessa tela deve ser atualizado na mesma manutencao
- referencia validada: `PRINCIPAL_PROFESSORES`, com primeira aba `Outras informações`, segunda aba `SQL`, SQL dinamico por filtro e `schoolId` real

### PAT-014 - Cabecalho padrao de programas Escola e Financeiro

- faixa principal em degradê azul com cantos arredondados
- cabecalho rola junto com a pagina e nao deve ficar fixo no topo
- coluna lateral esquerda com:
  - botao de menu
  - botao secundario da tela, normalmente notificacoes
- logotipo da escola imediatamente ao lado da coluna de botoes
- bloco textual com:
  - `eyebrow` em uppercase
  - titulo forte
  - descricao curta
- lado direito reservado para:
  - card branco do usuario
  - botao `VOLTAR`
- o lado direito deve ficar encaixado dentro da faixa azul, sem ultrapassar o bloco
- a reserva horizontal padrao do cabecalho deve proteger o lado direito antes da area textual, evitando sobreposicao com titulo e descricao
- a posicao vertical do bloco da direita deve ficar mais baixa que o topo do header, respeitando o encaixe visual aprovado na `PRINCIPAL`
- o componente compartilhado deve permitir reaproveitamento manual tela por tela, sem rollout automatico
- o mesmo padrao base pode ser usado na Escola e no Financeiro, mudando apenas os textos e o estado dos botoes
- o card branco do usuario no lado direito e obrigatorio nas telas que usam esse padrao, com:
  - nome do usuario em destaque
  - perfil logo abaixo em texto menor
  - avatar circular com iniciais
  - seta de menu no extremo direito
- o botao `VOLTAR` deve ficar abaixo do card do usuario, alinhado a direita e dentro da mesma faixa azul
- o conjunto `card do usuario + VOLTAR` deve repetir o encaixe visual aprovado na `PRINCIPAL_PROFESSORES`
- a tela `PRINCIPAL_MENSALIDADES` passa a usar essa mesma referencia visual como padrao correto para validacoes futuras
- em telas operacionais com grid embutido que precisam maximizar area util, pode existir variante compacta aprovada do cabecalho:
  - altura menor que o cabecalho padrao completo
  - mesmos elementos obrigatorios: botoes laterais, logotipo, `eyebrow`, titulo, descricao curta, card do usuario e `VOLTAR`
  - o card do usuario e o botao `VOLTAR` devem continuar totalmente dentro da faixa azul, sem ultrapassar o bloco
  - referencia aprovada: `PRINCIPAL_FINANCEIRO_PARCELAS`
- nenhuma tela existente deve ser alterada em lote por causa desse padrao:
  - a aplicacao deve acontecer manualmente
  - tela por tela
  - somente apos validacao explicita do usuario
- sempre que houver divergencia entre a implementacao local e esse padrao, a referencia soberana passa a ser:
  - `frontend/src/app/components/principal-program-header.tsx`
  - `frontend/src/app/principal/layout.tsx`
  - validacao visual aprovada em `PRINCIPAL_PROFESSORES`

Componente base:

- `frontend/src/app/components/principal-program-header.tsx`
- `frontend/src/app/principal/layout.tsx`

Telas referencia:

- `principal`
- `principal/notificacoes`
- `principal/pessoas`
- `principal/financeiro/[section]`
- `principal/professores`
- `principal/mensalidades`

### PAT-015 - Toolbar padrao de grid Escola e Financeiro

- este padrao nao substitui o cabecalho principal azul da tela
- ele so pode ser usado em telas que possuem grid, lista ou tabela operacional
- deve ser tratado como barra operacional da listagem
- estrutura aprovada:
  - esquerda: botao iconico de colunas seguido do botao de `EXPORTACAO/IMPRESSAO`
  - centro: controles operacionais visuais da listagem, como semaforo horizontal, toggles ou filtros de status
  - direita: contador institucional de registros exibidos
- o contador da direita deve manter leitura forte em uppercase, no estilo `REGISTROS EXIBIDOS (N)`
- o botao de colunas deve ser somente iconico, sem texto visivel, com tooltip e `aria-label` exatamente `ALTERAR COLUNAS GRID`
- o icone do botao de colunas deve representar colunas verticais dentro de um retangulo, mantendo botao compacto quadrado/arredondado
- a exportacao e a impressao da tela com grid devem ficar concentradas apenas no botao ao lado do botao de colunas
- quando a toolbar padrao estiver presente, o botao textual separado `EXPORTAR` no topo da tela deixa de ser necessario e deve ser removido para evitar duplicidade funcional
- telas com grid/lista nao devem exibir faixa explicativa contextual entre o cabecalho principal e a area da listagem
- telas com grid/lista nao devem exibir bloco textual intermediario detalhando o que a tela faz, para que a leitura comece direto na barra operacional e no conteudo da listagem
- telas com grid/lista nao devem criar uma segunda faixa azul interna repetindo `eyebrow`, titulo, descricao ou botao de voltar/menu logo abaixo do cabecalho principal
- qualquer explicacao adicional sobre a finalidade da tela deve aguardar o local especifico aprovado pelo usuario
- quando a tela tiver acao de incluir/cadastrar novo registro, esse botao deve ficar no canto esquerdo da area da listagem/grid
- a posicao aprovada para essa acao e como primeira informacao visual da linha de acoes acima do grid, antes de titulo, contador, busca ou qualquer acao secundaria
- o botao de incluir deve preferir formato compacto, mostrando apenas o icone `+`, com tooltip explicando a acao de cadastro
- a barra deve funcionar como segundo padrao oficial compartilhado entre Escola e Financeiro
- o uso continua manual, tela por tela, e nunca deve ser aplicado em paginas sem listagem
- a toolbar pode variar nas acoes especificas da tela, mas deve preservar a distribuicao visual esquerda/centro/direita aprovada

Componentes base:

- `frontend/src/app/components/grid-footer-controls.tsx`
- `frontend/src/app/components/grid-column-config-modal.tsx`
- `frontend/src/app/components/grid-export-modal.tsx`

Telas referencia:

- `principal/professores`
- `principal/alunos`
- `principal/responsaveis`
- telas do `principal/financeiro` que tiverem grid/listagem

### PAT-015.1 - Filtros diretos nas colunas do grid

- quando o usuario pedir "filtros direto nas colunas do grid", aplicar este padrao apenas nas colunas informadas no pedido
- o filtro deve aparecer no proprio cabecalho da coluna, ao lado do nome da coluna, preferencialmente como icone de lupa com tooltip `Filtrar <coluna>`
- ao clicar na lupa, abrir um painel compacto proximo ao cabecalho da coluna, sem criar faixa adicional acima do grid
- o painel nao deve sobrepor incoerentemente a primeira linha do grid nem a toolbar/rodape; quando necessario, reservar espaco interno temporario no grid enquanto o painel estiver aberto
- tipos de filtro aprovados:
  - data/periodo: campos `De` e `Ate`
  - texto, historico, documento ou nome: campo de busca textual
  - status, tipo ou categoria fechada: seletor com `TODOS` e opcoes da coluna
  - valor numerico/monetario: campos de valor minimo e valor maximo
- sempre que a coluna filtrada representar uma data, o filtro deve obrigatoriamente ser por periodo, exibindo os campos `De` e `Ate`, mesmo que o pedido do usuario diga apenas "filtrar a data"
- filtros textuais em coluna devem usar rascunho local: digitar no campo nao aplica automaticamente
- filtros textuais em coluna devem ter botao `Filtrar`; ao clicar, aplicar o valor, atualizar o grid e fechar o painel
- pressionar `Enter` dentro do campo textual equivale a clicar em `Filtrar`
- para filtros fechados com poucas opcoes, preferir botoes/pills em vez de select quando o usuario aprovar esse modelo visual
- os botoes/pills do mesmo painel devem ter exatamente a mesma largura, texto centralizado e alinhamento central no popup
- o botao/pill equivalente a `TODOS` deve usar o texto `AMBOS` quando o usuario pedir essa linguagem para o contexto da tela
- cores aprovadas para botoes/pills de filtro:
  - debito: vermelho/rose
  - credito: verde/emerald
  - pendente/nao conferido: amarelo/amber ou vermelho/rose quando o usuario pedir destaque de nao conferido
  - conciliado/conferido: verde/emerald
  - ambos/todos: azul/blue
- quando houver acoes em lote dentro do painel de filtro, como `Marcar todos como conferidos` ou `Marcar todos como nao conferidos`, elas devem respeitar somente os registros exibidos no grid naquele momento, incluindo filtros ativos
- cada painel deve ter acao local `Limpar` para zerar somente o filtro daquela coluna e fechar o painel
- sempre que houver filtro direto em coluna, deve existir tambem um botao iconico para limpar todos os filtros de uma vez
- a posicao aprovada para `Limpar todos os filtros` e no lado esquerdo do cabecalho do grid, obrigatoriamente como a primeira informacao visual do cabecalho, antes da primeira coluna filtravel
- o botao de limpar todos deve ser iconico, ter tooltip/aria-label `Limpar todos os filtros`, zerar todos os filtros do grid e fechar qualquer painel aberto
- o botao de limpar todos deve ter estado visual discreto quando nenhum filtro estiver ativo e ganhar destaque vermelho/rose quando existir um ou mais filtros/ordenacoes ativos
- os filtros devem responder na hora quando forem filtros locais; se a tela exigir consulta no backend, preservar tenant/RBAC e atualizar tambem a auditoria SQL da tela
- nao adicionar filtros em colunas nao solicitadas pelo usuario no prompt atual
- nao alterar layout aprovado da tela alem do menor ajuste necessario no cabecalho do grid

Referencia aprovada:

- `PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO`
- filtros `Conf.`, `Tipo` e `Situacao` da tela `PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO`
- `PRINCIPAL_FINANCEIRO_ESTOQUE`
- filtros `Produto` e `Código interno` da tela `PRINCIPAL_FINANCEIRO_ESTOQUE`

### PAT-015.2 - Grid com rolagem interna, cabecalho fixo e rodape paginado

- este modelo deve ser usado quando a tela possuir grid/listagem operacional com paginacao e volume suficiente para rolagem interna
- referencias aprovadas:
  - `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS`
  - `PRINCIPAL_FINANCEIRO_RETORNOS`
  - `PRINCIPAL_FINANCEIRO_PARCELAS`
  - `PRINCIPAL_PROFESSORES`
- telas com grid devem ocupar toda a area util disponivel da tela, do fim do cabecalho ate o limite inferior visivel da area principal, sem deixar faixa vazia abaixo do rodape do grid
- quando houver sobra vertical, a correcao deve ajustar somente a altura/flex da casca do grid, preservando layout, textos, cores, espacos internos, botoes e comportamento ja aprovados
- a implementacao recomendada e usar casca em coluna flexivel com altura calculada do viewport, `min-h-0`, card do grid com `flex-1`, toolbar/rodape com `shrink-0` e area de registros com `overflow-auto`
- a barra de rolagem vertical deve ficar dentro do grid; a pagina/tela externa nao deve ganhar uma segunda rolagem para percorrer os registros
- a rolagem deve mover apenas os registros do corpo da tabela
- o cabecalho das colunas deve permanecer fixo no topo do grid durante a rolagem dos registros
- o cabecalho fixo deve manter fundo solido e camada acima das linhas para nao misturar texto de coluna com conteudo rolado
- as linhas do corpo do grid devem ser zebradas com contraste perceptivel:
  - linhas pares ativas: fundo branco
  - linhas impares ativas: fundo `slate-200/70` ou contraste visual equivalente
  - linhas pares inativas: fundo `rose-100/80`
  - linhas impares inativas: fundo `rose-200/70`
  - o hover pode intensificar um nivel, sem remover a leitura do zebrado
- ao clicar em uma linha do grid, ela deve ficar destacada ate outra linha ser selecionada:
  - o destaque deve sobrepor temporariamente o zebrado
  - usar fundo azul claro e contorno azul perceptivel, como `bg-blue-100` com `outline-blue-400`
  - marcar a linha com `aria-selected` quando houver suporte na implementacao
- quando houver filtros por coluna, o filtro deve ficar no proprio cabecalho da coluna, seguindo `PAT-015.1`
- o botao iconico `Limpar todos os filtros` deve ser sempre a primeira informacao visual do cabecalho do grid, no canto esquerdo, antes da primeira coluna filtravel
- quando houver acao de incluir/cadastrar registro, o botao de incluir deve ficar na faixa de acoes acima do grid, no canto esquerdo, como primeira informacao visual da tela com grid; o cabecalho interno da tabela continua preservando `Limpar todos os filtros` como primeiro item quando existirem filtros por coluna
- o titulo acima do grid deve ser compacto; quando houver total importante para a operacao, mostrar esse total em pill ao lado do titulo, sem texto descritivo longo abaixo
- existem dois modelos oficiais para o final do grid:
  - modelo sem totais agregados: nao exibir faixa azul final; usar somente o rodape em linha unica com `Colunas`, impressao/exportacao, semaforo/status, `Total registros: N`, quantidade por pagina e navegacao
  - modelo com totais agregados: exibir uma faixa azul fixa no fim do grid, acima do rodape, somente quando pelo menos uma coluna precisar de somatorio/totalizacao operacional
- o rodape final do grid, com ou sem faixa azul de totais, deve permanecer sempre visivel na area util da tela; o usuario nao deve precisar rolar a pagina externa ou a casca hospedeira para enxergar botao de colunas, impressao/exportacao, semaforo/status, totais, quantidade por pagina, navegacao ou identificador tecnico
- a rolagem vertical deve ficar somente na area interna de registros do grid; em telas embutidas por iframe, a casca hospedeira deve ajustar a altura do iframe para caber na area disponivel e evitar uma segunda barra lateral fora do grid
- a estrutura aprovada para isso e: card do grid em coluna flexivel, toolbar superior e rodape com `shrink-0`, area de registros com `min-h-0` e `overflow-auto`, e casca hospedeira/iframe sem rolagem vertical externa
- contar registros sozinho nao caracteriza totalizacao de coluna e nao deve criar faixa azul
- em grids sem totais agregados, o contador `Total registros: N` deve ficar no rodape, ao lado do semaforo/status e antes dos controles de paginacao
- modelo e tipografia obrigatorios do rodape paginado sem faixa azul:
  - estrutura do rodape: linha unica quando houver largura, `border-t`, fundo claro (`bg-slate-50` ou equivalente), `px-4`, `py-3`, grupos com `gap-3` a esquerda e `gap-2` a direita
  - botao de colunas: iconico, sem texto visivel, `h-10`, `w-10`, `rounded-xl`, borda clara, fundo branco, sombra leve, tooltip/aria-label `ALTERAR COLUNAS GRID`
  - botao de impressao/exportacao: iconico, sem texto visivel, `h-9` ou `h-10` conforme altura do rodape aprovado, `w-9` ou `w-10`, `rounded-full`, borda clara, fundo branco, sombra leve
  - semaforo/status: tres chaves compactas na ordem `ATIVOS`, `TODOS/AMBOS`, `INATIVOS`, imediatamente depois da impressao/exportacao
  - pill `Total registros: N`: `inline-flex`, `h-8`, `items-center`, `rounded-full`, `border-slate-300`, `bg-white`, `px-3`, `text-[10px]`, `font-black`, `uppercase`, `tracking-[0.14em]`, `text-slate-600`, `shadow-sm`
  - totais auxiliares no rodape, quando aprovados sem faixa azul: mesma pill do contador; valor interno pode usar destaque azul (`text-blue-700`) com `ml-1`
  - combobox de quantidade por pagina: `h-8`, `rounded-full`, `border-slate-200`, `bg-white`, `px-3`, `text-[10px]`, `font-black`, `uppercase`, `tracking-[0.12em]`, `text-slate-600`; opcoes `10`, `20`, `50`, `100`
  - botoes de navegacao `<<`, `<`, `>` e `>>`: `h-8`, `min-w-8`, `rounded-full`, `border-slate-200`, `bg-white`, `px-2`, `text-[10px]`, `font-black`, `uppercase`, `tracking-[0.14em]`, `text-slate-600`, com estado disabled em baixa opacidade
  - indicador `pagina/total`: `min-w-20`, centralizado, `text-[10px]`, `font-black`, `uppercase`, `tracking-[0.14em]`, `text-slate-500`
- quando o grid tiver totais agregados no final da tabela, a linha final de totais deve ficar no fim do grid, fixa durante a rolagem interna dos registros e alinhada pelas mesmas colunas do grid
- a linha final de totais aprovada deve usar a mesma cor azul institucional do cabecalho financeiro:
  - fundo `#1d4f91`
  - borda superior `#153a6a`
  - celulas compactas com `px-4` e `py-1.5`
  - fonte compacta `text-[11px]`, `font-bold`, `uppercase` e `tracking-wider`
  - valores em branco (`text-white`)
  - sem criar rolagem externa na tela/pagina
- nessa linha final de totais, o contador `Total registros: N` deve aparecer no canto esquerdo em pill branco baixo:
  - `h-6`, `rounded-full`, `border-slate-200`, `bg-white`, `px-3`, `text-[9px]`, `font-black`, `uppercase`, `tracking-[0.12em]`, `text-slate-700` e `shadow-sm`
- em grids com totais agregados, nao duplicar `Total registros: N` no rodape; o contador fica somente na pill branca da linha azul
- o rodape do grid deve ficar em uma unica linha sempre que houver largura disponivel
- no lado esquerdo do rodape devem ficar, nesta ordem:
  - botao iconico de colunas, sem texto visivel, com tooltip/aria-label `ALTERAR COLUNAS GRID`
  - botao de impressao/exportacao
  - semaforo/status da listagem, como `ATIVOS`, `INATIVOS` e `AMBOS`, ou o equivalente aprovado para a tela
- o semaforo/status deve ficar ao lado do botao de impressao/exportacao, na mesma linha
- no canto direito do rodape devem ficar, na mesma linha:
  - combobox compacto de quantidade de registros por pagina, com opcoes como `10`, `20`, `50` e `100`
  - navegacao compacta de paginas com `<<`, `<`, indicador `pagina/total`, `>` e `>>`
- ao abrir qualquer tela com grid paginado, o combobox de quantidade por pagina deve iniciar obrigatoriamente em `10`
- `<<` volta para o inicio, `<` volta uma pagina, `>` avanca uma pagina e `>>` vai para o fim
- neste modelo nao exibir texto de intervalo como `1-10 de 100 registro(s)` no rodape; o rodape deve priorizar controles compactos
- acoes de linha no grid devem usar botoes iconicos, sem texto visivel dentro do botao; cada botao deve ter `title`/tooltip e `aria-label` explicando claramente a acao, como alterar, excluir, ativar, definir padrao, visualizar ou abrir detalhes
- quando a situacao ativa/inativa precisar aparecer na linha do grid, usar somente uma bolinha antes da descricao principal do registro, sem texto visivel de status:
  - bolinha verde = `ATIVO`
  - bolinha vermelha = `INATIVO`
  - a bolinha deve ter `title`/tooltip e `aria-label` com `ATIVO` ou `INATIVO`
  - nao criar coluna com titulo `Semaforo` nem pill textual `ATIVO`/`INATIVO` na linha
- preservar os botoes e controles ja aprovados da tela, alterando apenas a estrutura necessaria para cumprir este padrao

## Telas-modelo para novos sistemas

Usar estas telas como referencia inicial:

1. `dashboard/professores`
   - cadastro em abas
   - configuracao de grid
   - exportacao
2. `dashboard/alunos`
   - grid administrativo completo
   - popup de detalhes
3. `msinfor-admin`
   - painel master
   - acessos especiais
   - configuracoes globais

## Regras para reaproveitamento em sistema novo

Ao iniciar um novo sistema:

1. copiar primeiro o mapa tecnico de `ui-standards.ts`
2. copiar os componentes compartilhados ja estabilizados
3. usar este documento como checklist de implantacao
4. so criar variacao local quando houver motivo funcional real

## Checklist de captura de novo padrao

Quando um layout novo for aprovado, registrar:

- nome do padrao
- contexto funcional
- comportamento obrigatorio
- componente compartilhado afetado
- telas que adotaram o padrao
- riscos/limites conhecidos

## Status

- documento ativo
- manutencao continua
- deve crescer conforme novas aprovacoes de UI/UX
