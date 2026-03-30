# DECISIONS

Registro de decisoes tecnicas e funcionais do projeto.

## Modelo de registro

Para cada decisao, registrar:

- ID: DEC-0001
- Data: YYYY-MM-DD
- Contexto
- Decisao
- Impacto
- Alternativas consideradas
- Status: proposta | aceita | substituida

---

## DEC-0001

- Data: 2026-03-06
- Contexto: necessidade de escalar sem complexidade inicial alta
- Decisao: adotar monolito modular (NestJS) com evolucao futura para microservicos
- Impacto: entrega inicial mais rapida e menor custo operacional
- Alternativas consideradas: microservicos desde o inicio
- Status: aceita

## DEC-0002

- Data: 2026-03-06
- Contexto: isolamento de dados entre escolas e requisito obrigatorio
- Decisao: `schoolId` obrigatorio em entidades de dominio e filtro de tenant em toda query
- Impacto: reduz risco de vazamento cross-tenant
- Alternativas consideradas: banco por tenant
- Status: aceita

## DEC-0003

- Data: 2026-03-06
- Contexto: requisito de historico completo de dados
- Decisao: soft delete por `canceledAt` e proibicao de delete fisico
- Impacto: rastreabilidade e compliance funcional
- Alternativas consideradas: delete fisico com trilha parcial
- Status: aceita

## DEC-0004

- Data: 2026-03-11
- Contexto: necessidade de acelerar cadastro de acessos sem perder controle fino por tela
- Decisao: adotar modelo de autorizacao com `perfil pre-definido + permissao especifica por tela`, onde a permissao especifica sobrescreve o perfil padrao para aquela conta
- Impacto: reduz trabalho operacional no cadastro de professor, aluno, responsavel e usuarios da escola, mantendo flexibilidade para excecoes reais
- Alternativas consideradas: configurar permissao manual tela por tela para toda conta; usar apenas perfis fixos sem excecao individual
- Status: aceita

## DEC-0005

- Data: 2026-03-16
- Contexto: necessidade de reaproveitar padroes visuais e funcionais aprovados no sistema atual em sistemas futuros, sem depender apenas da memoria operacional
- Decisao: criar uma base oficial de padroes de UI/UX com documentacao em `UI_PATTERNS.md`, historico incremental em `UI_PATTERN_CHANGELOG.md` e mapa tecnico compartilhado no frontend em `ui-standards.ts`
- Impacto: acelera novos projetos, reduz divergencia entre telas e transforma aprovacoes visuais em patrimonio reutilizavel do produto
- Alternativas consideradas: manter apenas componentes sem documentacao; registrar decisoes de UI apenas em conversas e prompts
- Status: aceita

## DEC-0006

- Data: 2026-03-17
- Contexto: necessidade de padronizar o ciclo de vida visual dos registros nas grids administrativas, evitando botoes incoerentes para linhas ja inativas
- Decisao: adotar acao contextual de status nas grids, onde registros ativos mostram apenas `INATIVAR` e registros inativos mostram apenas `ATIVAR`, com marcador visual de inatividade na descricao principal
- Impacto: reduz erro operacional, melhora leitura do estado real do registro e cria padrao reutilizavel para novas telas com grid
- Alternativas consideradas: manter apenas botao de inativar; exibir sempre os dois botoes; esconder totalmente a acao para registros inativos
- Status: aceita

## DEC-0007

- Data: 2026-03-17
- Contexto: alunos, professores e responsaveis repetiam CPF, data de nascimento, endereco e credencial, dificultando o caso real onde a mesma pessoa exerce mais de um papel na escola
- Decisao: introduzir `Person` como cadastro mestre por tenant, ligando `Teacher`, `Student` e `Guardian` por `personId`, com login compartilhado e escolha de perfil quando o mesmo usuario possui mais de um papel
- Impacto: reduz duplicacao, melhora consistencia de credenciais e permite uma UX de entrada coerente para professor, aluno e responsavel sem quebrar os modulos operacionais existentes
- Alternativas consideradas: continuar apenas com sincronizacao por CPF entre tabelas separadas; unificar tudo em uma unica tabela operacional; criar usuarios independentes para cada papel mesmo quando a pessoa e a mesma
- Status: aceita

## DEC-0008

- Data: 2026-03-17
- Contexto: ambiguidades recorrentes no termo "pessoas" em requisitos de busca e autocomplete, causando expectativa diferente entre escopo academico e administrativo
- Decisao: padronizar que "pesquisar em pessoas" significa busca consolidada por tenant em `teachers`, `students`, `guardians` e `users`, usando `people` como base mestre quando aplicavel
- Impacto: reduz falhas de entendimento entre negocio e implementacao, melhora cobertura de busca por nome/CPF/email e evita regressao de escopo em telas administrativas
- Alternativas consideradas: limitar busca apenas ao modulo atual (ex.: somente professores); consultar somente `people` sem considerar tabelas operacionais e usuarios administrativos
- Status: aceita

## DEC-0009

- Data: 2026-03-30
- Contexto: operacao de softhouse passou a exigir exclusao definitiva de uma escola inteira com todas as dependencias, apenas a partir da tela master de administracao
- Decisao: criar um fluxo exclusivo de purge fisico irreversivel para tenant no MSINFOR ADMIN, separado do endpoint de cancelamento logico e protegido por chave master + confirmacao explicita do `tenantId`
- Impacto: viabiliza limpeza definitiva de escolas implantadas por engano ou descartadas, mas abre uma excecao controlada a politica historica de soft delete
- Alternativas consideradas: manter apenas cancelamento logico; apagar manualmente no banco; permitir delete fisico em modulos comuns
- Status: aceita
