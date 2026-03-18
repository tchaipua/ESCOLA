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
