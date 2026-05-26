# UI_STANDARD_EXPORT

## Objetivo

Este arquivo consolida o pacote minimo para exportar o padrao visual e operacional aprovado da Escola/MSINFOR para outro sistema.

Ele deve ser usado quando um novo projeto precisar herdar:

- padroes de tela, layout e componentes;
- regras de protecao de telas ja aprovadas;
- auditoria visual com nome tecnico da tela;
- popup de "Logica Usada nessa Tela";
- checklist de aceite visual e funcional.

## Contexto assumido

O sistema de destino pode ter outro dominio de negocio, mas deve reaproveitar o contrato visual aprovado neste projeto.

O padrao exportado nao autoriza redesenho automatico de telas existentes no sistema de destino. A aplicacao deve ser feita tela por tela, com menor impacto possivel e validacao explicita quando houver mudanca visual relevante.

## Fontes oficiais

Copiar ou referenciar os arquivos abaixo a partir deste projeto:

- `DOCUMENTACAO/AI/UI_PATTERNS.md`
- `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- `DOCUMENTACAO/AI/CODING_RULES.md`
- `DOCUMENTACAO/AI/DECISIONS.md`
- `frontend/src/app/lib/ui-standards.ts`

Decisoes de UI mais relevantes:

- `DEC-0005`: base oficial de padroes de UI/UX.
- `DEC-0012`: auditoria visual e tecnica obrigatoria das telas.
- `DEC-0013`: cabecalho padrao de programas com `PRINCIPAL_PROFESSORES` como referencia soberana.

## Regra soberana de protecao visual

Nenhuma tela, componente ou fluxo visual ja aprovado pode ser redesenhado, reorganizado ou refatorado visualmente sem solicitacao explicita.

Em manutencoes:

- alterar somente o problema pedido;
- preservar layout, espacamento, estrutura, textos, cores e comportamento;
- corrigir bugs por logica, dados ou validacao sempre que possivel;
- se houver impacto visual inevitavel, aplicar a menor mudanca possivel e registrar o risco no retorno.

## Pacote minimo para novo sistema

### 1. Documentacao

Criar no sistema de destino:

- `AGENTS.md`
- `DOCUMENTACAO/AI/UI_PATTERNS.md`
- `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- `DOCUMENTACAO/AI/UI_STANDARD_EXPORT.md`

Quando o novo sistema ja possuir documentacao propria, manter esta base como secao de padroes visuais oficiais e adaptar apenas nomes de dominio.

### 2. Mapa tecnico

Copiar e adaptar:

- `frontend/src/app/lib/ui-standards.ts`

Obrigatorio manter no mapa:

- id do padrao;
- nome;
- resumo;
- caminho da documentacao;
- componentes base;
- telas referencia;
- status.

### 3. Componentes base recomendados

Copiar ou recriar mantendo o mesmo contrato visual:

- `frontend/src/app/components/principal-program-header.tsx`
- `frontend/src/app/principal/layout.tsx`
- `frontend/src/app/components/screen-name-copy.tsx`
- `frontend/src/app/components/screen-audit-modal.tsx`
- `frontend/src/app/components/audited-popup-shell.tsx`
- `frontend/src/app/components/grid-footer-controls.tsx`
- `frontend/src/app/components/grid-column-config-modal.tsx`
- `frontend/src/app/components/grid-export-modal.tsx`
- `frontend/src/app/components/grid-sortable-header.tsx`
- `frontend/src/app/components/grid-status-filter.tsx`
- `frontend/src/app/components/grid-row-action-icon-button.tsx`
- `frontend/src/app/components/record-status-indicator.tsx`
- `frontend/src/app/components/grid-record-popover.tsx`
- `frontend/src/app/lib/grid-export-utils.ts`
- `frontend/src/app/lib/tenant-branding-cache.ts`

Se o sistema de destino nao usar Next.js/React, recriar componentes equivalentes preservando comportamento e hierarquia visual.

## Padroes obrigatorios exportados

### Cabecalho padrao de programas

Referencia soberana:

- `PRINCIPAL_PROFESSORES`
- `frontend/src/app/components/principal-program-header.tsx`
- `frontend/src/app/principal/layout.tsx`

Contrato:

- faixa principal em degrade azul;
- logotipo da escola/empresa no lado esquerdo;
- botoes laterais compactos quando aplicavel;
- titulo e descricao curta;
- card branco do usuario no lado direito;
- botao `VOLTAR` abaixo do card do usuario;
- cabecalho rola com a pagina, sem `sticky`;
- aplicacao manual, nunca em lote.

### Toolbar padrao de grid/listagem

Usar somente em telas com grid, lista ou tabela operacional.

Contrato:

- esquerda: `COLUNAS` e exportacao/impressao;
- centro: filtros, semaforo ou controles operacionais;
- direita: contador `REGISTROS EXIBIDOS (N)`;
- botao de incluir na mesma linha da busca, no lado esquerdo, preferencialmente com icone `+`;
- nao criar faixa explicativa entre cabecalho e grid;
- nao criar segunda faixa azul interna com titulo/descricao.

### Grid administrativo

Contrato:

- ordenacao no cabecalho da coluna;
- configuracao de colunas;
- exportacao institucional;
- filtro de status;
- a mesma definicao base de colunas alimenta grid e exportacao;
- configuracao de grid e exportacao sao independentes por usuario.

### Acoes de status

Contrato:

- registro ativo mostra somente `INATIVAR`;
- registro inativo mostra somente `ATIVAR`;
- nao exibir as duas acoes ao mesmo tempo;
- status visual usa icone com tooltip em uppercase;
- inativacao/cancelamento deve respeitar confirmacao e auditoria.

### Popups e modais institucionais

Contrato:

- logotipo da escola/empresa no cabecalho quando houver contexto;
- nome tecnico exclusivo, estavel e nao reutilizado;
- bloco `Tela:` isolado no rodape;
- botao de copiar ao lado do nome tecnico;
- ao copiar, abrir o popup de "Logica Usada nessa Tela";
- modais novos devem nascer com auditoria visual, nao receber isso depois.

### Popup "Logica Usada nessa Tela"

Contrato:

- overlay escuro com blur;
- modal central;
- cabecalho escuro em degrade;
- lado esquerdo do cabecalho com logotipo institucional, etiqueta `Auditoria SQL`, identificador tecnico da tela e pill `ORIGEM: SISTEMA ...`;
- seletor de abas `Outras informações` / `SQL` no centro do cabecalho;
- lado direito do cabecalho com botoes `Fechar` e `Copiar SQL` do mesmo tamanho;
- `Copiar SQL` visivel somente quando a aba `SQL` estiver ativa;
- origem/path do arquivo em pill vermelha logo abaixo do cabecalho;
- aba `Outras informações` aberta por padrao com estrutura, tabelas, relacionamentos, metricas, filtros, ordenacao e observacoes;
- aba `SQL` separada com fonte monoespacada, scroll proprio e somente SQL/base logica copiavel;
- sem botoes duplicados no rodape do modal.

## Modelo de AGENTS.md para o sistema de destino

```md
# AGENTS

## Fonte oficial de documentacao

Toda documentacao-base do projeto fica em `DOCUMENTACAO/AI`.

## Regra soberana de UI

Telas, componentes e fluxos visuais ja aprovados nao devem ser redesenhados, refatorados visualmente ou reorganizados sem solicitacao explicita.

Em manutencoes de tela, alterar somente o problema pedido, preservando layout, espacamento, estrutura, componentes, textos, cores e comportamento ja aprovados.

Se a correcao exigir impacto visual inevitavel, aplicar a menor mudanca possivel e deixar claro o risco no retorno final.

## Padroes obrigatorios importados

- Usar `DOCUMENTACAO/AI/UI_PATTERNS.md` como fonte oficial de UI/UX.
- Registrar mudancas aprovadas em `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`.
- Manter o mapa tecnico em `frontend/src/app/lib/ui-standards.ts` ou equivalente.
- Toda tela criada ou alterada deve manter nome tecnico exclusivo e botao de copia/auditoria.
- Todo popup/modal novo deve nascer com logotipo no cabecalho, identificador exclusivo e auditoria visual no rodape.
- Ao copiar o nome tecnico, abrir o popup de "Logica Usada nessa Tela".

## Contrato minimo de saida de qualquer agente

Toda entrega deve informar:

- contexto assumido;
- regra de negocio aplicada;
- arquivos afetados;
- riscos/pontos pendentes.
```

## Checklist de implantacao no novo sistema

- [ ] Copiar documentacao oficial de UI.
- [ ] Criar ou atualizar `AGENTS.md`.
- [ ] Copiar/adaptar `ui-standards.ts`.
- [ ] Copiar/adaptar componentes compartilhados.
- [ ] Definir a tela referencia do cabecalho no novo sistema.
- [ ] Definir padrao de grid/listagem.
- [ ] Implantar `ScreenNameCopy` ou equivalente.
- [ ] Implantar popup de auditoria da tela.
- [ ] Validar que cada tela possui nome tecnico unico.
- [ ] Validar que telas embutidas nao duplicam identificador visual.
- [ ] Registrar variacoes aprovadas no changelog.

## Checklist de aceite visual por tela

- [ ] A tela preserva layout aprovado quando for manutencao.
- [ ] O cabecalho segue o padrao oficial quando aplicavel.
- [ ] Telas com grid abrem direto na toolbar/listagem.
- [ ] Nao existe faixa explicativa indevida entre cabecalho e grid.
- [ ] Nao existe segunda faixa azul interna duplicando titulo/descricao.
- [ ] Grid possui colunas, exportacao, status e contador quando aplicavel.
- [ ] Acoes de status mostram apenas a acao contextual correta.
- [ ] Popup/modal possui logo, nome tecnico e auditoria visual.
- [ ] O nome tecnico e exclusivo e estavel.
- [ ] O popup de logica da tela informa origem, tabelas, filtros, ordenacao e SQL/base logica.

## Adaptacoes permitidas

Sao permitidas adaptacoes de:

- nome do sistema;
- dominio de negocio;
- nomes tecnicos das telas;
- rotas e paths;
- tabelas e SQL/base logica;
- permissoes e papeis;
- identidade visual institucional quando o produto exigir marca diferente.

Nao sao permitidas sem aprovacao explicita:

- trocar a hierarquia visual aprovada;
- remover auditoria visual;
- duplicar identificador de tela;
- aplicar rollout automatico em telas existentes;
- redesenhar fluxo aprovado durante manutencao funcional.

## Riscos conhecidos

- Copiar apenas CSS sem documentacao tende a quebrar o padrao com o tempo.
- Copiar componentes sem o `AGENTS.md` deixa agentes livres para redesenhar telas aprovadas.
- Aplicar cabecalho ou toolbar em lote pode gerar regressao visual.
- Sistemas com framework diferente devem preservar comportamento, nao necessariamente o mesmo codigo.
- O popup de auditoria precisa refletir tabelas reais do sistema de destino.

## Regra final

Este padrao deve ser tratado como contrato de produto, nao como inspiracao visual.
