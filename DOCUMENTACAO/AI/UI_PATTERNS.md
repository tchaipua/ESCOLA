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

- todo popup/modal exibido no sistema deve trazer o logotipo da escola no cabeçalho quando houver contexto de tenant logado
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
- popups e modais do painel principal e demais módulos administrativos

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
  - esquerda: botao `COLUNAS` seguido do botao de `EXPORTACAO/IMPRESSAO`
  - centro: controles operacionais visuais da listagem, como semaforo horizontal, toggles ou filtros de status
  - direita: contador institucional de registros exibidos
- o contador da direita deve manter leitura forte em uppercase, no estilo `REGISTROS EXIBIDOS (N)`
- a exportacao e a impressao da tela com grid devem ficar concentradas apenas no botao ao lado de `COLUNAS`
- quando a toolbar padrao estiver presente, o botao textual separado `EXPORTAR` no topo da tela deixa de ser necessario e deve ser removido para evitar duplicidade funcional
- telas com grid/lista nao devem exibir faixa explicativa contextual entre o cabecalho principal e a area da listagem
- telas com grid/lista nao devem exibir bloco textual intermediario detalhando o que a tela faz, para que a leitura comece direto na barra operacional e no conteudo da listagem
- telas com grid/lista nao devem criar uma segunda faixa azul interna repetindo `eyebrow`, titulo, descricao ou botao de voltar/menu logo abaixo do cabecalho principal
- qualquer explicacao adicional sobre a finalidade da tela deve aguardar o local especifico aprovado pelo usuario
- quando a tela tiver acao de incluir/cadastrar novo registro, esse botao deve ficar na mesma linha da busca
- a posicao aprovada para essa acao e no lado esquerdo do campo de busca, como primeiro elemento da linha
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
