# UI_PATTERN_CHANGELOG

## Objetivo

Registrar a evolucao dos padroes visuais e funcionais aprovados no produto.

## Como usar

Sempre que um novo padrao for aprovado ou um padrao existente mudar de comportamento:

1. criar uma nova entrada neste arquivo
2. atualizar `UI_PATTERNS.md`
3. atualizar o componente compartilhado correspondente
4. atualizar `frontend/src/app/lib/ui-standards.ts` quando o mapa tecnico mudar

## Modelo de entrada

### UIP-0001

- Data: YYYY-MM-DD
- Padrao: nome curto
- Contexto: onde foi aprovado
- Alteracao: o que mudou
- Componentes/Telas: arquivos impactados
- Status: aprovado

---

### UIP-0001

- Data: 2026-03-16
- Padrao: base oficial de UI MSINFOR
- Contexto: necessidade de preservar layouts e comportamentos aprovados para reaproveitamento em sistemas futuros
- Alteracao: criacao do documento mestre de padroes, do changelog de UI e do mapa tecnico compartilhado no frontend
- Componentes/Telas:
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
  - `frontend/src/app/lib/ui-standards.ts`
- Status: aprovado

### UIP-0002

- Data: 2026-03-16
- Padrao: exportacao Excel institucional
- Contexto: necessidade de substituir `.xls` HTML por `.xlsx` real e padronizar identidade visual
- Alteracao: cabecalho com logo da escola, topo congelado, linha unica por registro, total somente no rodape final e largura de coluna pelo maior conteudo do campo
- Componentes/Telas:
  - `frontend/src/app/lib/grid-export-utils.ts`
  - telas que exportam via utilitario compartilhado
- Status: aprovado

### UIP-0003

- Data: 2026-03-16
- Padrao: definicao unica de campos entre grid e export
- Contexto: necessidade de garantir que qualquer campo novo aprovado em telas com grid fique disponivel automaticamente tanto no configurador de colunas quanto na selecao do export
- Alteracao: consolidacao da regra de que a definicao base de colunas da grid e a fonte oficial para os campos disponiveis do export, mantendo independente apenas a selecao do usuario entre grid e export
- Componentes/Telas:
  - `frontend/src/app/lib/grid-export-utils.ts`
  - telas com `GridColumnConfigModal`
  - telas com `GridExportModal`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- Status: aprovado

### UIP-0004

- Data: 2026-03-17
- Padrao: acao de status contextual no grid
- Contexto: necessidade de evitar incoerencia visual em registros inativos, onde a linha continuava exibindo apenas `INATIVAR`
- Alteracao: padronizacao do comportamento em que a ultima acao da linha muda conforme o estado do registro, exibindo `INATIVAR` para ativos e `ATIVAR` para inativos, com indicador visual de `INATIVO` na descricao
- Componentes/Telas:
  - `frontend/src/app/components/grid-row-action-icon-button.tsx`
  - `frontend/src/app/components/inactive-record-indicator.tsx`
  - grids principais do dashboard escolar
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- Status: aprovado

### UIP-0005

- Data: 2026-03-17
- Padrao: indicador visual unico de status (`ATIVO` / `INATIVO`)
- Contexto: necessidade de remover texto de status nas grids e padronizar leitura por icone com tooltip
- Alteracao: criacao do componente compartilhado `record-status-indicator` e aplicacao nas principais grids do dashboard, tanto na descricao da linha quanto na coluna de status
- Componentes/Telas:
  - `frontend/src/app/components/record-status-indicator.tsx`
  - `frontend/src/app/dashboard/professores/page.tsx`
  - `frontend/src/app/dashboard/alunos/page.tsx`
  - `frontend/src/app/dashboard/responsaveis/page.tsx`
  - `frontend/src/app/dashboard/disciplinas/page.tsx`
  - `frontend/src/app/dashboard/series/page.tsx`
  - `frontend/src/app/dashboard/turmas/page.tsx`
  - `frontend/src/app/dashboard/grade/page.tsx`
  - `frontend/src/app/dashboard/grade-anual/page.tsx`
  - `frontend/src/app/dashboard/grade-horaria/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- Status: aprovado

### UIP-0006

- Data: 2026-03-17
- Padrao: popup de confirmação de status com identidade da escola
- Contexto: o fluxo administrativo exigiu uma confirmação visualmente rica para ativar/inativar registros (por exemplo, disciplinas), ao invés do modal nativo do navegador solicitado pelos usuários.
- Alteracao: substituição do `window.confirm` por um modal com logo da escola, descrição clara do impacto, `RecordStatusIndicator` e botões diferenciados (`Cancel` em rosa claro e `Confirmar ativação/inativação`) que respeitam o estado de processamento.
- Componentes/Telas:
  - `frontend/src/app/dashboard/disciplinas/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- Status: aprovado
