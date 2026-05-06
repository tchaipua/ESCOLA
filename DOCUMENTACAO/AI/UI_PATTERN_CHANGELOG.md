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

### UIP-0007

- Data: 2026-03-25
- Padrão: identificador e botão Fechar em modais/popup
- Contexto: definir um comportamento uniforme para nomes de tela e botões de cancelamento em todos os modais do painel principal, garantindo rastreabilidade e linguagem visual coerente com o `screen-name-copy`.
- Alteração: toda tela/modal passou a expor um nome exclusivo com botão de cópia no canto inferior direito e a ação “Cancelar” foi padronizada como “Fechar” com fundo vermelho e posicionamento à esquerda no rodapé de ações.
- Contexto adicional: telas de inativação/remover agora exigem a senha do usuário logado para abrir o modal, com confirmação válida por 5 minutos antes de pedir novamente.
- Componentes/Telas:
  - `frontend/src/app/components/screen-name-copy.tsx`
  - `frontend/src/app/principal/series/page.tsx`
  - `frontend/src/app/principal/turmas/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- Status: aprovado

### UIP-0008

- Data: 2026-03-25
- Padrão: alerta de validação de senha em modais sensíveis
- Contexto: as telas de cancelamento e inativação precisam deixar o erro de senha em branco ou inválida mais visível para evitar ações indevidas após múltiplas tentativas.
- Alteração: o `StatusConfirmationModal` agora rende um alerta em estilo “pop-up” no canto superior, reforçando o texto uppercase com `role="alert"` sempre que a senha falha; o botão “Fechar” foi estilizado com fundo vermelho e o rodapé garante os botões na mesma linha. O padrão foi documentado em `UI_PATTERNS.md`.
- Componentes/Telas:
  - `frontend/src/app/components/status-confirmation-modal.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- Status: aprovado

### UIP-0009

- Data: 2026-04-02
- Padrão: popup institucional com logo da escola e identificador exclusivo
- Contexto: necessidade de padronizar popups de bloqueio, erro e confirmação em todo o sistema com identidade visual da escola e rastreabilidade do nome da tela
- Alteração: todo popup deve exibir o logotipo da escola no cabeçalho quando houver tenant, além de um identificador exclusivo no canto inferior direito com botão de cópia para clipboard no estilo `ScreenNameCopy`
- Componentes/Telas:
  - `frontend/src/app/components/screen-name-copy.tsx`
  - `frontend/src/app/lib/tenant-branding-cache.ts`
  - popups/modais do painel principal e módulos administrativos
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- Status: aprovado

### UIP-0010

- Data: 2026-04-03
- Padrão: identificador de popup em linha exclusiva no rodapé
- Contexto: necessidade de consolidar que novos popups/modais mantenham o nome da tela separado dos botões principais, com leitura mais limpa e rastreabilidade estável
- Alteração: o rodapé dos popups passou a reservar uma linha exclusiva para `Tela:` e uma linha dedicada para o identificador com botão de cópia ao lado, sempre abaixo da linha principal de ações
- Componentes/Telas:
  - `frontend/src/app/components/screen-name-copy.tsx`
  - popups/modais do painel principal e módulos administrativos
- `DOCUMENTACAO/AI/UI_PATTERNS.md`
- `frontend/src/app/lib/ui-standards.ts`
- Status: aprovado

### UIP-0011

- Data: 2026-05-06
- Padrao: cabecalho padrao de programas Escola/Financeiro
- Contexto: necessidade de consolidar o cabecalho azul aprovado com botoes laterais, logotipo da escola e bloco do usuario para reaproveitamento controlado tela por tela
- Alteracao: criacao do componente compartilhado `principal-program-header`, registro do padrao em `UI_PATTERNS.md` e entrada no mapa tecnico `ui-standards.ts`, mantendo o comportamento sem `sticky`
- Componentes/Telas:
  - `frontend/src/app/components/principal-program-header.tsx`
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0012

- Data: 2026-05-06
- Padrao: ajuste fino do bloco direito do cabecalho de programas
- Contexto: durante a validacao visual da `PRINCIPAL`, o bloco de usuario e o botao `VOLTAR` precisaram de mais reserva lateral e reposicionamento vertical para permanecer totalmente dentro da faixa azul
- Alteracao: o padrao passou a incluir classes compartilhadas para a reserva do lado direito no componente e para o posicionamento aprovado do overlay no layout, evitando novo desalinhamento nas proximas telas
- Componentes/Telas:
  - `frontend/src/app/components/principal-program-header.tsx`
  - `frontend/src/app/principal/layout.tsx`
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0013

- Data: 2026-05-06
- Padrao: toolbar padrao de grid Escola/Financeiro
- Contexto: necessidade de separar oficialmente o cabecalho principal azul da barra operacional usada apenas em telas com lista, preservando um segundo padrao reutilizavel para Escola e Financeiro
- Alteracao: registro do padrao de toolbar de grid com distribuicao esquerda/centro/direita, contador `REGISTROS EXIBIDOS (N)` e uso restrito a telas com grid, incluindo entrada propria no mapa tecnico
- Componentes/Telas:
  - `frontend/src/app/components/grid-footer-controls.tsx`
  - `frontend/src/app/components/grid-column-config-modal.tsx`
  - `frontend/src/app/components/grid-export-modal.tsx`
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado
