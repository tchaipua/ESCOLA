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

### UIP-2026-06-06-01

- Data: 2026-06-06
- Padrao: tipografia compacta do rodape paginado de grid
- Contexto: validacao visual do rodape na tela `PRINCIPAL_FINANCEIRO_BANCOS`, comparando com o padrao aprovado de grid da Escola
- Alteracao: o `PAT-015.2` passa a registrar o modelo exato do rodape sem faixa azul: linha unica com botoes iconicos, semaforo/status, `Total registros: N` em pill branca baixa, seletor de pagina e navegacao compacta, usando fonte `text-[10px]`, `font-black`, `uppercase` e tracking especifico (`0.12em`/`0.14em`)
- Componentes/Telas:
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `frontend/src/app/components/grid-standard-footer.tsx`
  - telas com grid paginado da Escola e do Financeiro
- Status: aprovado

### UIP-2026-06-05-01

- Data: 2026-06-05
- Padrao: botao iconico de colunas no rodape do grid
- Contexto: padronizacao solicitada para todas as telas da Escola e do Financeiro com botao de colunas no rodape/grid
- Alteracao: o botao de colunas passa a ser somente iconico, sem texto visivel, com tooltip e `aria-label` `ALTERAR COLUNAS GRID`
- Componentes/Telas:
  - `frontend/src/app/components/grid-standard-footer.tsx`
  - `frontend/src/app/components/grid-footer-controls.tsx`
  - telas com botao manual de colunas
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- Status: aprovado

### UIP-2026-06-03-01

- Data: 2026-06-03
- Padrao: filtro de coluna de data sempre por periodo
- Contexto: padronizacao compartilhada entre Escola e Financeiro para filtros diretos em colunas de grid
- Alteracao: toda coluna que represente data deve abrir filtro por periodo, com campos `De` e `Ate`, mesmo quando o pedido mencionar apenas filtro de data
- Componentes/Telas:
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - telas com grid e filtros por coluna
- Status: aprovado

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
  - `frontend/src/app/principal/grade/page.tsx`
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

### UIP-0014

- Data: 2026-05-07
- Padrao: acao unica de exportacao na toolbar da grid
- Contexto: necessidade de eliminar duplicidade entre o botao textual `EXPORTAR` no topo da tela e o botao de exportacao/impressao localizado ao lado de `COLUNAS` na barra operacional da listagem
- Alteracao: o padrao de telas com grid da Escola e do Financeiro passou a determinar que a exportacao/impressao fique concentrada apenas no botao ao lado de `COLUNAS`, tornando desnecessario o botao textual separado quando a toolbar padrao estiver presente
- Componentes/Telas:
  - `frontend/src/app/components/grid-footer-controls.tsx`
  - `frontend/src/app/components/grid-export-modal.tsx`
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0015

- Data: 2026-05-07
- Padrao: sem faixa explicativa em telas com grid/lista
- Contexto: definicao de que a tela com listagem deve ficar mais objetiva, sem bloco textual intermediario entre o cabecalho principal e a area do grid

### UIP-0019

- Data: 2026-05-15
- Padrao: popup institucional com auditoria tecnica obrigatoria desde a criacao
- Contexto: necessidade de transformar em regra explicita que todo novo popup da Escola ja nasca com identidade visual institucional e rastreabilidade tecnica completa
- Alteracao: o padrao oficial de popup passou a exigir, por default, logotipo no cabecalho, nome tecnico exclusivo, bloco `Tela:` isolado no rodape e abertura da logica usada com SQL/base logica, tabelas, relacionamentos, filtros e ordenacao
- Componentes/Telas:
  - `frontend/src/app/components/screen-name-copy.tsx`
  - `frontend/src/app/components/screen-audit-modal.tsx`
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/CODING_RULES.md`
- Status: aprovado
- Alteracao: o padrao oficial de telas com grid da Escola e do Financeiro passou a vedar faixa explicativa contextual nessa posicao, mantendo foco direto na toolbar e na listagem
- Componentes/Telas:
  - `frontend/src/app/principal/professores/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0016

- Data: 2026-05-07
- Padrao: posicao compacta do botao de incluir em telas com grid/lista
- Contexto: definicao de que a acao de cadastro de novo registro deve ficar integrada a barra operacional da listagem, sem competir com o cabecalho principal da tela
- Alteracao: quando existir acao de incluir em telas com grid da Escola e do Financeiro, o botao deve aparecer na mesma linha da busca, no lado esquerdo como primeiro elemento, em formato compacto com icone `+` e tooltip de cadastro
- Componentes/Telas:
  - `frontend/src/app/principal/professores/page.tsx`
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0018

- Data: 2026-05-13
- Padrao: consolidacao final do cabecalho Escola/Financeiro com bloco direito aprovado
- Contexto: durante a validacao visual entre `PRINCIPAL_PROFESSORES` e `PRINCIPAL_MENSALIDADES`, foi confirmado que o trecho final correto do cabecalho e o mesmo bloco direito com card branco do usuario e botao `VOLTAR` encaixados dentro da faixa azul
- Alteracao: o padrao oficial passou a registrar explicitamente `PRINCIPAL_PROFESSORES` como referencia soberana do lado direito do cabecalho, aplicavel tanto no sistema Escola quanto no sistema Financeiro, com rollout manual e nunca automatico em telas existentes
- Componentes/Telas:
  - `frontend/src/app/components/principal-program-header.tsx`
  - `frontend/src/app/principal/layout.tsx`
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
  - `DOCUMENTACAO/AI/DECISIONS.md`
- Status: aprovado

### UIP-0017

- Data: 2026-05-07
- Padrao: sem texto descritivo entre cabecalho e grid
- Contexto: confirmacao de que telas com listagem da Escola e do Financeiro devem abrir a experiencia diretamente na barra operacional e na grid, sem faixa intermediaria explicando o objetivo da tela
- Alteracao: reforco explicito no padrao de toolbar/grid de que nao deve existir bloco ou faixa textual detalhando o que a tela faz entre o cabecalho principal e a area da listagem
- Componentes/Telas:
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
  - `frontend/src/app/lib/ui-standards.ts`
  - `frontend/src/app/principal/financeiro/[section]/page.tsx`
- Status: aprovado

### UIP-0020

- Data: 2026-05-18
- Padrao: sem faixa azul interna duplicada em telas com grid/lista
- Contexto: foi aprovado que novas telas com grid/lista nao devem repetir abaixo do cabecalho principal uma segunda faixa com eyebrow, titulo, descricao e botao de voltar/menu
- Alteracao: reforco do padrao de grid/lista para abrir direto na barra operacional e no grid; explicacoes adicionais devem aguardar o local especifico indicado pelo usuario
- Componentes/Telas:
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/produtos/page.tsx`
- Status: aprovado

### UIP-0021

- Data: 2026-05-18
- Padrao: identificador unico e exclusivo por tela
- Contexto: na tela `PRINCIPAL_FINANCEIRO_ESTOQUE`, o grid interno do Financeiro estava exibindo um segundo nome tecnico junto do nome tecnico da tela hospedeira
- Alteracao: toda tela nova deve ter apenas um nome tecnico visivel por vez; esse nome deve ser exclusivo, estavel e nao reutilizado em outra tela, rota, popup ou fluxo visual
- Componentes/Telas:
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/produtos/page.tsx`
- Status: aprovado

### UIP-0022

- Data: 2026-05-23
- Padrao: auditoria SQL em abas e com parametros reais
- Contexto: na validacao da tela `PRINCIPAL_PROFESSORES`, foi aprovado que a auditoria deve separar informacoes funcionais do SQL executavel e mostrar os filtros atuais do grid, incluindo busca digitada e tenant real
- Alteracao: a auditoria visual passa a abrir por padrao na aba `Outras informações`, com a aba `SQL` separada contendo somente a consulta copiavel; parametros como `schoolId`/`tenantId`, status, busca, disciplina, filial e ordenacao devem aparecer com valores reais sempre que possivel
- Regra complementar: nomes humanos de apoio, como nome da escola, podem aparecer entre parenteses apenas na aba de informacoes; o SQL deve permanecer executavel e sem texto amigavel que quebre a consulta
- Componentes/Telas:
  - `frontend/src/app/components/screen-audit-modal.tsx`
  - `frontend/src/app/principal/layout.tsx`
  - `frontend/src/app/principal/professores/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/CODING_RULES.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0023

- Data: 2026-05-23
- Padrao: layout do modal de auditoria SQL com abas no cabecalho
- Contexto: apos a validacao visual da `PRINCIPAL_PROFESSORES`, foi aprovado que o seletor `Outras informações` / `SQL` deve ficar no cabecalho do modal, junto da identidade da tela e dos botoes principais
- Alteracao: o cabecalho do modal passa a concentrar logotipo, etiqueta `Auditoria SQL`, identificador tecnico, origem do sistema, abas centrais e botoes `Fechar`/`Copiar SQL` a direita; `Copiar SQL` aparece somente na aba `SQL` e nao ha botoes duplicados no rodape
- Componentes/Telas:
  - `frontend/src/app/components/screen-audit-modal.tsx`
  - `frontend/src/app/principal/professores/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/CODING_RULES.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0024

- Data: 2026-05-28
- Padrao: filtros diretos nas colunas do grid com limpeza global
- Contexto: na validacao da tela `PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO`, foi aprovado o uso de filtros diretamente no cabecalho das colunas do grid
- Alteracao: quando o usuario pedir filtros direto nas colunas, cada coluna solicitada deve receber uma lupa no cabecalho e painel compacto de filtro; sempre deve existir tambem um botao iconico no lado esquerdo do cabecalho do grid para `Limpar todos os filtros`, zerando todos os filtros e fechando paineis abertos
- Componentes/Telas:
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/bancos/extrato/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0025

- Data: 2026-05-29
- Padrao: filtros de coluna com botoes/pills centralizados e largura uniforme
- Contexto: na tela `PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO`, foi aprovado que filtros fechados no cabecalho do grid, como `Conf.`, `Tipo` e `Situacao`, devem usar botoes/pills coloridos em vez de select quando esse modelo for solicitado
- Alteracao: os botoes/pills do painel devem ficar centralizados, com o mesmo tamanho, texto centralizado e cores por semantica; `AMBOS` deve ser azul quando usado como opcao geral; acoes em lote no painel devem atuar somente sobre os registros exibidos no grid no momento
- Componentes/Telas:
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/bancos/extrato/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0026

- Data: 2026-06-01
- Padrao: filtros textuais de coluna com botao `Filtrar` e fechamento automatico
- Contexto: na validacao da tela `PRINCIPAL_FINANCEIRO_ESTOQUE`, foi aprovado que filtros textuais por coluna nao devem aplicar enquanto o usuario digita; a telinha deve aplicar somente pelo botao `Filtrar` ou Enter e fechar em seguida
- Alteracao: o PAT-015.1 passa a exigir rascunho local para filtro textual, botao `Filtrar`, fechamento automatico apos aplicar, fechamento ao limpar a coluna, destaque vermelho/rose no limpar filtros global quando houver filtro/ordenacao ativa, reserva de espaco para o painel nao sobrepor grid ou toolbar e `Limpar todos os filtros` como primeira informacao visual do cabecalho do grid
- Componentes/Telas:
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/produtos/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0027

- Data: 2026-06-02
- Padrao: grid com rolagem interna, cabecalho fixo e rodape paginado
- Contexto: na validacao da tela `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS`, foi aprovado um modelo completo para telas com grid paginado, mantendo a rolagem apenas nos registros e preservando cabecalho/rodape do grid sempre visiveis
- Alteracao: criado o `PAT-015.2` com barra de rolagem dentro do grid, cabecalho de colunas fixo, filtros por coluna com `Limpar todos os filtros` como primeiro botao do cabecalho, rodape em linha unica com `Colunas`, impressao/exportacao, semaforo/status, combobox `10/20/50/100` e navegacao `<< < pagina/total > >>`
- Componentes/Telas:
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/contas-a-pagar/importacao-notas/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0028

- Data: 2026-06-02
- Padrao: botoes iconicos de acao em linhas de grid
- Contexto: na tela `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS`, foi aprovado que botoes de acao de linha nao devem usar texto visivel quando houver icone claro para a acao
- Alteracao: o `PAT-015.2` passa a registrar que acoes de linha em grid devem usar botoes iconicos, sem texto dentro do botao, sempre com `title`/tooltip e `aria-label` explicando a acao, como alterar, excluir, ativar, definir padrao, visualizar ou abrir detalhes
- Componentes/Telas:
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/contas-a-pagar/certificados-digitais/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0029

- Data: 2026-06-02
- Padrao: status ativo/inativo por bolinha na linha do grid
- Contexto: na tela `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS`, foi aprovado que a situacao do registro nao deve aparecer como coluna `Semaforo` nem como pill textual `ATIVO`/`INATIVO`
- Alteracao: o `PAT-015.2` passa a registrar que status ativo/inativo em linhas de grid deve usar somente uma bolinha antes da descricao principal; verde representa `ATIVO`, vermelho representa `INATIVO`, sempre com `title`/tooltip e `aria-label`
- Componentes/Telas:
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/contas-a-pagar/certificados-digitais/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0030

- Data: 2026-06-02
- Padrao: botao de incluir como primeira informacao em telas com grid
- Contexto: na tela `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS`, foi aprovado que a acao de incluir deve ficar sempre no canto esquerdo da area de grid
- Alteracao: o `PAT-015.2` passa a registrar que, quando houver acao de incluir/cadastrar em tela com grid, o botao deve ficar na faixa de acoes acima do grid, no canto esquerdo, como primeira informacao visual antes de titulo, contador, busca ou acoes secundarias
- Componentes/Telas:
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/contas-a-pagar/certificados-digitais/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0031

- Data: 2026-06-02
- Padrao: grid zebrado com contraste perceptivel
- Contexto: na tela `PRINCIPAL_PROFESSORES`, foi aprovado que as linhas do grid precisam ter zebrado mais destacado
- Alteracao: o `PAT-015.2` passa a registrar zebrado com contraste perceptivel no corpo do grid: linhas pares ativas brancas, linhas impares ativas em `slate-200/70` ou equivalente, inativas em tons rose mais fortes e hover um nivel acima sem perder a leitura do zebrado
- Componentes/Telas:
  - `frontend/src/app/principal/professores/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0032

- Data: 2026-06-02
- Padrao: destaque persistente da linha clicada no grid
- Contexto: na tela `PRINCIPAL_PROFESSORES`, foi aprovado que ao clicar em uma linha do grid ela deve ficar destacada
- Alteracao: o `PAT-015.2` passa a registrar que a linha clicada deve permanecer destacada ate outra linha ser selecionada, sobrepondo temporariamente o zebrado com fundo azul claro, contorno azul perceptivel e `aria-selected` quando houver suporte
- Componentes/Telas:
  - `frontend/src/app/principal/professores/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0033

- Data: 2026-06-02
- Padrao: total de registros no rodape do grid
- Contexto: na tela `PRINCIPAL_PROFESSORES`, foi aprovado que o total de registros deve aparecer no rodape ao lado do semaforo/status
- Alteracao: o `PAT-015.2` passa a registrar que o rodape do grid deve exibir `Total registros: N` ao lado do semaforo/status, antes dos controles de quantidade por pagina e navegacao
- Componentes/Telas:
  - `frontend/src/app/principal/professores/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0034

- Data: 2026-06-02
- Padrao: quantidade padrao de 10 registros por pagina no grid
- Contexto: foi aprovado que toda tela com grid deve abrir com o combobox de quantidade por pagina marcado em `10`
- Alteracao: o `PAT-015.2` passa a registrar que grids paginados devem iniciar obrigatoriamente com `10` registros por pagina, mantendo as opcoes `10`, `20`, `50` e `100`
- Componentes/Telas:
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0035

- Data: 2026-06-02
- Padrao: logotipo institucional obrigatorio em cabecalho de popup Escola/Financeiro
- Contexto: na tela `PRINCIPAL_ALUNOS`, foi reforcado que qualquer popup precisa manter o logotipo da escola no cabecalho, mesmo quando o popup tambem mostra foto/avatar do registro.
- Alteracao: o `PAT-013` passa a registrar explicitamente que o logotipo institucional e obrigatorio e independente de avatar/foto do registro, com validade compartilhada para `Escola` e `Financeiro`.
- Componentes/Telas:
  - `frontend/src/app/principal/alunos/page.tsx`
  - `frontend/src/app/components/grid-record-popover.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `C:/Sistemas/IA/Financeiro/DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `C:/Sistemas/IA/Financeiro/DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0036

- Data: 2026-06-03
- Padrao: totais finais do grid em azul com contador em pill branco
- Contexto: na tela `PRINCIPAL_FINANCEIRO_RETORNOS`, foi aprovado que a linha final de totais do grid use o azul institucional `#1d4f91` e que `Total registros: N` apareca em pill branco no canto esquerdo.
- Alteracao: o `PAT-015.2` passa a registrar que grids com totais agregados devem manter a linha final fixa no fim do grid, alinhada pelas colunas, com borda `#153a6a`, valores em branco e contador `Total registros: N` no formato pill aprovado.
- Componentes/Telas:
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/recebiveis/retornos/page.tsx`
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/lib/grid-page-standards.ts`
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0037

- Data: 2026-06-03
- Padrao: dois modelos de final de grid
- Contexto: foi aprovado que telas com grid podem ter final simples sem faixa azul quando nao houver coluna a totalizar, e final com faixa azul somente quando houver totais agregados por coluna.
- Alteracao: o `PAT-015.2` passa a registrar explicitamente que contar registros sozinho nao justifica a linha azul; grids sem totais agregados exibem `Total registros: N` apenas no rodape ao lado do semaforo/status, enquanto grids com totais por coluna exibem a faixa azul com contador em pill branco e valores alinhados, sem duplicar o contador no rodape.
- Componentes/Telas:
  - `frontend/src/app/principal/professores/page.tsx`
  - `frontend/src/app/principal/responsaveis/page.tsx`
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/recebiveis/retornos/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0038

- Data: 2026-06-05
- Padrao: rodape do grid sempre visivel sem rolagem externa
- Contexto: na tela `PRINCIPAL_FINANCEIRO_PARCELAS`, foi aprovado que as informacoes finais do grid devem ficar sempre visiveis, sem exigir rolagem da pagina externa ou da casca hospedeira; a barra lateral vertical deve permanecer apenas dentro da area de registros do grid.
- Alteracao: o `PAT-015.2` passa a registrar que o rodape final do grid, com ou sem faixa azul de totais, deve permanecer visivel na area util da tela; em telas embutidas por iframe, a casca hospedeira deve ajustar a altura do iframe para evitar uma segunda barra lateral fora do grid.
- Componentes/Telas:
  - `frontend/src/app/principal/financeiro/[section]/page.tsx`
  - `frontend/src/app/principal/layout.tsx`
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/recebiveis/parcelas/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0039

- Data: 2026-06-05
- Padrao: cabecalho compacto e grid operacional sem rolagem externa
- Contexto: na tela `PRINCIPAL_FINANCEIRO_PARCELAS`, foi aprovado o conjunto visual compacto para telas operacionais com grid: cabecalho azul mais baixo, card do usuario e `VOLTAR` dentro da faixa azul, toolbar superior alinhada a esquerda, cabecalho do grid fixo, rodape sempre visivel e rolagem vertical apenas dentro da area de registros.
- Alteracao: `PAT-014` passa a registrar a variante compacta de cabecalho para telas com grid embutido; `PAT-015.2` passa a reforcar botao iconico de colunas com tooltip `CONFIGURAR COLUNAS DO GRID`, seletor/paginacao compactos, card do grid em coluna flexivel e ausencia de barra lateral externa.
- Componentes/Telas:
  - `frontend/src/app/principal/financeiro/[section]/page.tsx`
  - `frontend/src/app/principal/layout.tsx`
  - `C:/Sistemas/IA/Financeiro/frontend/src/app/recebiveis/parcelas/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
  - `frontend/src/app/lib/ui-standards.ts`
- Status: aprovado

### UIP-0040

- Data: 2026-06-23
- Padrao: grid ocupando toda a area util da tela
- Contexto: na tela `PRINCIPAL_PROFESSORES`, foi aprovado que telas com grid nao devem deixar faixa vazia abaixo do rodape do grid; o card/listagem deve ocupar toda a altura disponivel da area principal.
- Alteracao: o `PAT-015.2` passa a registrar que telas com grid devem ocupar toda a area util disponivel, do fim do cabecalho ate o limite inferior visivel, usando ajuste de altura/flex da casca do grid sem redesenhar layout aprovado.
- Componentes/Telas:
  - `frontend/src/app/principal/professores/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
  - `C:/Sistemas/IA/Financeiro/DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `C:/Sistemas/IA/Financeiro/DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado
