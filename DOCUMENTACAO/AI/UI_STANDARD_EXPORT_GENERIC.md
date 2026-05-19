# UI_STANDARD_EXPORT_GENERIC

## Objetivo

Este arquivo define um padrao neutro para exportar identidade visual, comportamento de telas e regras de preservacao de layout para qualquer novo sistema.

Ele deve ser usado quando um projeto precisar herdar um contrato de UI/UX com:

- padroes de tela e layout;
- componentes reutilizaveis;
- protecao de telas ja aprovadas;
- identificador tecnico por tela;
- auditoria visual da logica da tela;
- checklist de aceite visual.

## Contexto assumido

O sistema de destino pode pertencer a qualquer dominio de negocio.

Este padrao nao carrega regra funcional de um produto especifico. Ele define somente como telas, grids, cabecalhos, modais, auditoria visual e manutencoes de layout devem se comportar.

## Regra soberana de protecao visual

Telas, componentes e fluxos visuais ja aprovados nao podem ser redesenhados, reorganizados ou refatorados visualmente sem solicitacao explicita.

Em manutencoes:

- alterar somente o problema pedido;
- preservar layout, espacamento, estrutura, textos, cores e comportamento ja aprovados;
- priorizar correcao por logica, dados, validacao ou integracao;
- evitar mudancas visuais amplas;
- se houver impacto visual inevitavel, aplicar a menor mudanca possivel e registrar o risco.

## Pacote minimo para um novo sistema

Criar ou adaptar no sistema de destino:

- `AGENTS.md`
- `DOCUMENTACAO/AI/UI_PATTERNS.md`
- `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- `DOCUMENTACAO/AI/UI_STANDARD_EXPORT_GENERIC.md`
- mapa tecnico de padroes, por exemplo `ui-standards.ts`

## Mapa tecnico de padroes

O sistema deve manter um arquivo tecnico com a lista dos padroes aprovados.

Cada padrao deve registrar:

- `id`: identificador estavel do padrao;
- `name`: nome exibivel;
- `summary`: resumo do comportamento;
- `documentationPath`: caminho da documentacao;
- `componentPaths`: componentes relacionados;
- `referenceScreens`: telas usadas como referencia visual;
- `status`: `approved` ou `evolving`.

Exemplo neutro:

```ts
export type UiPatternId =
  | 'program-header'
  | 'grid-toolbar'
  | 'admin-grid'
  | 'column-config-modal'
  | 'grid-export'
  | 'institutional-popup'
  | 'screen-audit-modal';

export type UiPatternDefinition = {
  id: UiPatternId;
  name: string;
  summary: string;
  documentationPath: string;
  componentPaths: string[];
  referenceScreens: string[];
  status: 'approved' | 'evolving';
};
```

## Componentes base recomendados

O sistema deve possuir componentes equivalentes para:

- cabecalho padrao de programa;
- layout principal com area de usuario e acao de retorno;
- copia do identificador tecnico da tela;
- modal de auditoria da tela;
- estrutura padrao de popup/modal auditavel;
- toolbar operacional de grid/listagem;
- configuracao de colunas;
- exportacao de grid;
- cabecalho ordenavel de coluna;
- filtro visual de status;
- botao contextual de status;
- indicador visual de status;
- popup de detalhes de registro;
- utilitarios de exportacao;
- cache ou contexto de identidade visual institucional.

Se o sistema usar outro framework, os componentes podem ser recriados em tecnologia equivalente, mantendo o mesmo contrato visual e funcional.

## Padroes obrigatorios

### Cabecalho padrao de programa

Contrato:

- faixa principal com identidade visual forte;
- logotipo, marca ou iniciais da organizacao no lado esquerdo;
- area textual com categoria, titulo e descricao curta;
- area direita reservada para dados do usuario;
- acao de retorno posicionada junto da area do usuario;
- cabecalho deve pertencer ao fluxo da pagina, sem fixacao obrigatoria no topo;
- aplicacao manual, tela por tela;
- nenhuma tela existente deve ser alterada em lote sem aprovacao.

### Toolbar padrao de grid/listagem

Usar somente em telas com grid, lista ou tabela operacional.

Contrato:

- esquerda: configuracao de colunas e exportacao/impressao;
- centro: filtros, seletores ou controles operacionais;
- direita: contador de registros exibidos;
- acao de incluir/cadastrar deve ficar proxima da busca;
- evitar blocos explicativos entre cabecalho e listagem;
- evitar segundo cabecalho interno repetindo titulo e descricao.

### Grid administrativo

Contrato:

- busca clara;
- ordenacao por coluna;
- configuracao de colunas;
- exportacao;
- filtro de status quando aplicavel;
- contador de registros;
- fonte unica de definicao de campos para grid e exportacao;
- preferencias persistidas por usuario quando o sistema possuir autenticacao.

### Configuracao de colunas

Contrato:

- modal com cabecalho fixo;
- lista de campos com rolagem propria;
- campos ativos antes dos inativos;
- controle visual claro para ativar/desativar coluna;
- reordenacao quando aplicavel;
- acoes para restaurar padrao e salvar.

### Exportacao de dados

Contrato:

- exportacao baseada nos registros visiveis ou filtrados conforme regra da tela;
- campos disponiveis derivados da mesma definicao base do grid;
- configuracao de exportacao independente da configuracao visual do grid;
- suporte aos formatos definidos pelo sistema;
- quando houver exportacao institucional, incluir marca, titulo, data e total de registros.

### Acoes de status

Contrato:

- registro ativo deve exibir somente a acao de inativar/cancelar;
- registro inativo deve exibir somente a acao de ativar/restaurar;
- nao exibir acoes contraditorias ao mesmo tempo;
- status visual deve ser representado por indicador consistente;
- mutacoes sensiveis devem exigir confirmacao;
- toda mutacao deve respeitar auditoria do sistema.

### Popups e modais institucionais

Contrato:

- cabecalho com identidade visual quando houver contexto institucional;
- titulo claro;
- conteudo com area de rolagem propria quando extenso;
- acoes principais agrupadas no rodape;
- botao de fechar sempre visivel;
- identificador tecnico exclusivo no rodape;
- botao de copia do identificador tecnico;
- abertura da auditoria visual da tela ao copiar ou acionar o identificador, conforme padrao adotado.

### Identificador tecnico da tela

Contrato:

- toda tela, modal ou popup novo deve possuir identificador tecnico exclusivo;
- o identificador deve ser estavel;
- o mesmo identificador nao pode ser reutilizado em outro fluxo visual;
- telas embutidas nao devem duplicar identificadores visiveis quando a tela hospedeira ja possuir um identificador;
- o identificador deve ajudar suporte, auditoria e handoff entre agentes.

### Modal de auditoria da tela

Contrato:

- overlay escuro com desfoque;
- modal central;
- cabecalho destacado;
- identificador tecnico da tela;
- origem tecnica do arquivo, rota ou componente;
- area rolavel com a logica usada;
- secao para entidades, tabelas, colecoes, endpoints ou fontes de dados;
- secao para relacionamentos;
- secao para campos exibidos;
- secao para filtros;
- secao para ordenacao;
- secao para consulta, pseudo-SQL, endpoint ou base logica;
- botao para copiar a base logica;
- botao para fechar.

Quando a tela nao consultar dados diretamente, a auditoria deve declarar isso de forma explicita.

## Modelo neutro de AGENTS.md

```md
# AGENTS

## Fonte oficial de documentacao

Toda documentacao-base do projeto fica em `DOCUMENTACAO/AI`.

## Regra soberana de UI

Telas, componentes e fluxos visuais ja aprovados nao devem ser redesenhados, refatorados visualmente ou reorganizados sem solicitacao explicita.

Em manutencoes de tela, alterar somente o problema pedido, preservando layout, espacamento, estrutura, componentes, textos, cores e comportamento ja aprovados.

Se a correcao exigir impacto visual inevitavel, aplicar a menor mudanca possivel e registrar o risco no retorno final.

## Padroes obrigatorios

- Usar `DOCUMENTACAO/AI/UI_PATTERNS.md` como fonte oficial de UI/UX.
- Registrar mudancas aprovadas em `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`.
- Manter um mapa tecnico de padroes de UI.
- Toda tela criada ou alterada deve manter identificador tecnico exclusivo.
- Todo popup/modal novo deve nascer com estrutura auditavel.
- Ao acionar o identificador tecnico, abrir a auditoria visual da tela.

## Contrato minimo de saida de qualquer agente

Toda entrega deve informar:

- contexto assumido;
- regra aplicada;
- arquivos afetados;
- riscos/pontos pendentes.
```

## Checklist de implantacao

- [ ] Criar documentacao oficial de UI.
- [ ] Criar changelog de UI.
- [ ] Criar ou atualizar `AGENTS.md`.
- [ ] Criar mapa tecnico de padroes.
- [ ] Implantar cabecalho padrao de programa.
- [ ] Implantar toolbar padrao de grid/listagem.
- [ ] Implantar componentes de grid.
- [ ] Implantar configuracao de colunas.
- [ ] Implantar exportacao.
- [ ] Implantar identificador tecnico de tela.
- [ ] Implantar modal de auditoria da tela.
- [ ] Implantar estrutura padrao de popup/modal auditavel.
- [ ] Definir telas de referencia visual.
- [ ] Validar que identificadores tecnicos sao unicos.
- [ ] Registrar variacoes aprovadas no changelog.

## Checklist de aceite visual por tela

- [ ] A tela preserva layout aprovado quando for manutencao.
- [ ] O cabecalho segue o padrao definido quando aplicavel.
- [ ] Telas com grid iniciam direto na barra operacional e listagem.
- [ ] Nao existe bloco explicativo indevido entre cabecalho e grid.
- [ ] Nao existe cabecalho interno duplicado sem necessidade.
- [ ] Grid possui busca, colunas, exportacao, status e contador quando aplicavel.
- [ ] Acoes de status mostram apenas a acao contextual correta.
- [ ] Popup/modal possui estrutura auditavel.
- [ ] Identificador tecnico e unico e estavel.
- [ ] Auditoria da tela informa origem, fontes de dados, filtros, ordenacao e base logica.

## Adaptacoes permitidas

Sao permitidas adaptacoes de:

- nome do produto;
- dominio de negocio;
- identidade visual;
- nomes tecnicos;
- rotas;
- componentes;
- fontes de dados;
- endpoints;
- entidades;
- permissoes;
- papeis de usuario.

Nao sao permitidas sem aprovacao explicita:

- trocar a hierarquia visual aprovada;
- remover identificador tecnico;
- remover auditoria visual;
- duplicar identificador de tela;
- aplicar mudancas em lote em telas existentes;
- redesenhar fluxo aprovado durante manutencao funcional.

## Riscos conhecidos

- Copiar apenas estilos sem documentacao enfraquece o padrao.
- Copiar componentes sem regra de protecao permite regressao visual.
- Aplicar padroes em lote pode quebrar telas ja aprovadas.
- Sistemas com tecnologia diferente devem preservar comportamento e hierarquia visual, mesmo que o codigo mude.
- A auditoria da tela precisa refletir a fonte real de dados de cada sistema.

## Regra final

Este arquivo define um contrato neutro de UI/UX e auditoria visual.

Ele nao deve conter regra de negocio especifica de nenhum sistema.

