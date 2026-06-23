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

## DEC-0010

- Data: 2026-03-31
- Contexto: o mesmo e-mail pode existir em perfis e escolas diferentes, e o negocio exige credencial unica por e-mail para login e troca de senha sem quebrar o isolamento operacional do tenant
- Decisao: tratar o e-mail como chave global apenas nos fluxos de autenticacao compartilhada, permitindo busca cross-tenant somente em `login`, `forgot-password`, validacao de senha compartilhada e alteracao de senha global por e-mail; fora desses fluxos, o isolamento por `tenantId` permanece obrigatorio
- Impacto: garante que um mesmo e-mail possa entrar em varias escolas, recuperar senha corretamente e manter uma unica senha em todos os perfis vinculados, sem liberar cruzamento de dados operacionais entre escolas
- Alternativas consideradas: manter senha independente por escola; permitir cruzamento geral de dados por e-mail em qualquer tela; limitar a verificacao apenas ao cadastro atualmente logado
- Status: aceita

## DEC-0011

- Data: 2026-04-02
- Contexto: o sistema escolar ja possui `monthlyFee` em `students` e vinculo de parentesco em `guardian_students`, mas precisa se preparar para futura integracao com uma plataforma financeira separada e compartilhada com outros ramos, sem criar contrato escolar completo agora
- Decisao: armazenar a regra de `quem paga a mensalidade` no proprio `students`, usando campos como `billingPayerType`, `billingGuardianId` e, opcionalmente, `billingDueDay`; manter `guardian_students` apenas como tabela de vinculo e parentesco; expor ao financeiro futuro o `referente` e o `pagador` como conceitos separados
- Impacto: reduz acoplamento entre dominio escolar e dominio financeiro, simplifica a implementacao incremental no sistema escolar atual e preserva compatibilidade futura com outros ramos, como petshop
- Alternativas consideradas: salvar o pagador diretamente em `guardian_students`; criar um modulo de contrato escolar completo neste momento; replicar a logica financeira inteira dentro do sistema escolar
- Status: aceita

## DEC-0012

- Data: 2026-04-30
- Contexto: necessidade de padronizar a auditoria visual e tecnica das telas para suporte, validacao e entendimento da origem dos dados
- Decisao: toda tela da Escola deve manter no rodape o botao de copiar o nome tecnico da tela; ao clicar, alem de copiar o identificador, deve abrir um popup central com a "Logica Usada nessa Tela"
- Impacto: cada tela passa a documentar sua propria logica operacional, tabelas fisicas, aliases, relacionamentos, metricas/campos exibidos, filtros, ordenacao e SQL/base logica da consulta
- Alternativas consideradas: manter apenas copia simples do nome da tela; documentar logica somente em arquivos externos; criar auditoria apenas para telas financeiras
- Status: aceita

## DEC-0013

- Data: 2026-05-13
- Contexto: necessidade de preservar de forma oficial o cabecalho aprovado das telas Escola e Financeiro, evitando novas divergencias no bloco direito de usuario e `VOLTAR`
- Decisao: adotar `PRINCIPAL_PROFESSORES` como referencia visual soberana do cabecalho padrao de programas, com reutilizacao tecnica por meio de `principal-program-header.tsx` + `principal/layout.tsx`, mantendo aplicacao manual tela por tela e proibindo rollout automatico em telas ja existentes sem validacao explicita do usuario. Para telas operacionais com grid embutido e necessidade de maximizar area util, fica aprovada a variante compacta validada em `PRINCIPAL_FINANCEIRO_PARCELAS`, preservando botoes laterais, logotipo, texto principal, card do usuario e `VOLTAR` totalmente dentro da faixa azul.
- Impacto: o padrao do cabecalho passa a ficar salvo como regra oficial do produto, reaproveitavel tanto no sistema Escola quanto no Financeiro, com menor risco de regressao visual em novas manutencoes
- Alternativas consideradas: manter apenas referencia por imagem/conversa; aplicar alteracao em lote em todas as telas imediatamente; permitir variacoes locais sem componente base nem documentacao
- Status: aceita

## DEC-0014

- Data: 2026-05-16
- Contexto: empresas/escolas podem operar com uma ou mais filiais, mas o uso de filial nao deve poluir a tela quando houver apenas uma filial operacional
- Decisao: introduzir `TenantBranch` e `branchCode` nos cadastros de negocio; quando houver apenas uma filial ativa, o backend grava automaticamente na filial existente e o frontend oculta qualquer seletor; quando houver mais de uma filial, os cadastros exibem a escolha entre uma filial especifica ou `0` como cadastro comum a todas as filiais
- Impacto: preserva simplicidade para escola com filial unica, permite isolamento operacional por filial em cadastros como professor, aluno, responsavel, serie, turma, disciplina, ano letivo e grade, e mantem registros comuns visiveis junto da filial atual
- Alternativas consideradas: exigir filial em todas as telas mesmo com uma filial; criar bancos separados por filial; tratar filial somente no Financeiro
- Status: aceita

## DEC-0015

- Data: 2026-05-17
- Contexto: a Escola consome telas embutidas do projeto `Financeiro`, cujo frontend foi atualizado para `next@16.2.6` apos `npm audit fix --force`; o `npm audit` do Financeiro ainda sugere downgrade para Next 9 por causa de `postcss` interno do Next, o que e incompatível com App Router moderno
- Decisao: registrar na Escola apenas como risco acompanhado de integracao, mantendo a decisao tecnica principal no projeto `Financeiro`; nao aplicar nenhuma mudanca no frontend da Escola por causa desse alerta
- Impacto: a Escola continua consumindo o Financeiro normalmente, e qualquer acao corretiva sobre Next/PostCSS deve ser tratada no repositorio `Financeiro`
- Alternativas consideradas: duplicar a correcao na Escola; forcar downgrade do Next no Financeiro; ignorar o risco sem registro na documentacao da vertical consumidora
- Status: aceita

## DEC-0016

- Data: 2026-05-17
- Contexto: o cadastro de empresa/escola deve concentrar parametros gerais, enquanto logotipo, CNPJ, endereco e contatos operacionais pertencem as filiais.
- Decisao: manter a criacao automatica da primeira filial ao cadastrar uma empresa, sem expor conceito especial para essa filial, e permitir gerenciar filiais diretamente no grid `MSINFOR_ADMIN_UNIDADES_ATIVAS`, com campos proprios de logotipo, documento, contato e endereco.
- Impacto: novas empresas ja nascem com filial operacional, e cadastros por filial passam a ter origem administrativa clara no MSINFOR ADMIN.
- Alternativas consideradas: manter CNPJ/endereco somente no tenant; criar filiais apenas via API; exigir filial em todas as telas mesmo com unidade unica.
- Status: aceita

## DEC-0017

- Data: 2026-05-17
- Contexto: parametros de estoque podem variar por filial, mas alguns produtos precisam decidir individualmente se controlam estoque, quantidade inteira, lote, validade, grade e estoque negativo.
- Decisao: armazenar na filial os parametros de estoque com os modos `NO`, `YES` e `BY_PRODUCT`; quando a filial estiver em `BY_PRODUCT`, a regra efetiva deve ser resolvida pelo cadastro do produto.
- Impacto: permite forcar comportamento para todos os produtos de uma filial ou delegar a decisao produto a produto, incluindo controle unico de grade sem separar cor e tamanho/numero como parametros independentes.
- Alternativas consideradas: usar apenas booleanos por filial; separar cor e tamanho/numero em parametros distintos; manter parametros somente no produto.
- Status: aceita

## DEC-0018

- Data: 2026-05-17
- Contexto: a empresa possui configuracao SMTP geral, mas uma filial pode precisar enviar e-mails por uma conta propria.
- Decisao: duplicar a configuracao SMTP na filial como opcional; quando a filial possuir SMTP preenchido, ele tem prioridade sobre o SMTP da empresa, e quando estiver vazio o sistema usa o SMTP geral da empresa.
- Impacto: permite remetente e credenciais especificos por filial sem obrigar configuracao duplicada para todas as unidades.
- Alternativas consideradas: manter SMTP somente na empresa; exigir SMTP em todas as filiais; mover SMTP totalmente para filial e remover da empresa.
- Status: aceita

## DEC-0019

- Data: 2026-05-17
- Contexto: arquivos da escola podem ser salvos em storage S3/Contabo, e algumas filiais podem precisar usar bucket, pasta ou credenciais proprias.
- Decisao: armazenar configuracao de storage tanto na empresa quanto na filial; quando a filial possuir configuracao preenchida, ela tem prioridade, e quando estiver vazia o sistema usa a configuracao da empresa.
- Impacto: permite centralizar storage na empresa para casos simples e sobrescrever por filial quando houver segregacao operacional de arquivos.
- Alternativas consideradas: manter storage somente em configuracao global da softhouse; exigir storage em todas as filiais; mover storage totalmente para filial.
- Status: aceita

## DEC-0020

- Data: 2026-05-23
- Contexto: a tela `PRINCIPAL_PROFESSORES` consolidou o modelo visual do modal que mostra a auditoria SQL, separando informacoes funcionais e SQL executavel.
- Decisao: adotar esse modelo como padrao oficial: cabecalho com logotipo/origem/identificador a esquerda, abas `Outras informações` e `SQL` no centro, botoes `Fechar` e `Copiar SQL` a direita, `Copiar SQL` visivel somente na aba `SQL` e sem botoes duplicados no rodape.
- Impacto: novas telas da Escola e telas integradas ao Financeiro devem manter a mesma estrutura ao exibir auditoria SQL, reduzindo divergencia visual e evitando SQL copiado com parametros incompletos.
- Alternativas consideradas: manter abas no corpo do modal; manter botoes no rodape; deixar cada sistema com modal diferente.
- Status: aceita

## DEC-0021

- Data: 2026-05-23
- Contexto: escolas podem possuir varias filiais, mas nem todo usuario administrativo deve operar em todas elas.
- Decisao: controlar filiais liberadas por usuario em `user_branch_accesses`; usuarios com papel `ADMIN` e acesso master podem escolher qualquer filial ativa sem precisar de vinculo explicito.
- Impacto: o login passa a solicitar escolha de filial quando houver mais de uma filial liberada, o `branchCode` escolhido entra no token e o modulo financeiro integrado recebe o mesmo `sourceBranchCode`.
- Alternativas consideradas: criar usuarios duplicados por filial; permitir todos os usuarios em todas as filiais; controlar filial apenas no frontend.
- Status: aceita

## DEC-0022

- Data: 2026-05-26
- Contexto: professores, alunos e responsaveis podem ser usados em mais de uma filial especifica, sem necessariamente liberar todas as filiais da empresa.
- Decisao: adicionar vinculos de filial por papel operacional em `teacher_branch_accesses`, `student_branch_accesses` e `guardian_branch_accesses`; manter `branchCode = 0` para "todas as filiais" e usar os vinculos apenas quando houver selecao parcial.
- Impacto: cadastros passam a permitir marcar filial 1 e 3, por exemplo, e o login oferece somente as filiais liberadas para aquele papel.
- Alternativas consideradas: duplicar cadastros por filial; usar apenas `branchCode = 0` para todos os casos; reaproveitar `user_branch_accesses` fora de usuarios administrativos.
- Status: aceita

## DEC-0023

- Data: 2026-06-02
- Contexto: a tela `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS` consolidou um modelo mais eficiente para telas com grid paginado, com foco no conteudo da listagem.
- Decisao: adotar o modelo compartilhado em Escola e Financeiro: rolagem vertical apenas dentro do grid, cabecalho de colunas fixo, linhas do corpo zebradas com contraste perceptivel, linha clicada destacada ate outra linha ser selecionada, filtros no cabecalho com `Limpar todos os filtros` como primeiro botao a esquerda, botao de incluir/cadastrar no canto esquerdo da area da listagem como primeira informacao visual acima do grid quando existir essa acao, combobox compacto de quantidade por pagina iniciado em `10` e navegacao compacta `<< < pagina/total > >>`; no final do grid existem dois modelos oficiais: sem totais agregados por coluna nao ha faixa azul e o rodape exibe botao iconico de colunas com tooltip `CONFIGURAR COLUNAS DO GRID`, impressao/exportacao, semaforo/status e `Registros: N` ou equivalente aprovado pela tela; com totais agregados por coluna, a faixa azul fica acima do rodape com `Total registros: N` em pill branco e valores alinhados nas colunas, sem duplicar esse contador no rodape; contar registros sozinho nao justifica faixa azul; o rodape nao deve exibir texto de intervalo como `1-10 de 100 registro(s)`; o rodape final do grid deve permanecer sempre visivel, sem exigir rolagem da pagina externa ou da casca hospedeira.
- Impacto: novas telas com grid paginado devem seguir `DOCUMENTACAO/AI/UI_PATTERNS.md`, `PAT-015.2`, preservando maior area util para registros, evitando rolagem duplicada e mantendo a barra lateral apenas dentro da area de registros do grid.
- Alternativas consideradas: manter cabecalho rolando junto com linhas; manter paginacao separada em outra linha; exibir contador de intervalo no rodape.
- Status: aceita

## DEC-0024

- Data: 2026-06-02
- Contexto: popups administrativos podem exibir foto/avatar do registro, mas o usuario aprovou que todo popup deve manter o logotipo institucional no cabecalho.
- Decisao: em `Escola` e `Financeiro`, todo popup/modal deve ter logotipo institucional no cabecalho; se houver foto/avatar/icone do registro, ele deve aparecer como elemento adicional e nao substituir o logotipo.
- Impacto: preserva identidade visual da escola/empresa e padroniza suporte/auditoria visual em popups dos dois sistemas.
- Alternativas consideradas: usar apenas avatar do registro em popups de detalhe; manter a regra somente na Escola; tratar como opcional em popups pequenos.
- Status: aceita

## DEC-0025

- Data: 2026-06-23
- Contexto: o ecossistema local possui o sistema `Escola` em `C:\Sistemas\IA\Escola` e o sistema `Financeiro` em `C:\Sistemas\IA\Financeiro`; o financeiro nao e apenas uma pasta interna da Escola, mas um projeto separado com backend, frontend e documentacao propria.
- Decisao: tratar `Escola` e `Financeiro` como dois sistemas/repositories separados e integrados por contrato/API. A `Escola` mantem as regras escolares e envia/consome contexto financeiro; o `Financeiro` e dono da operacao financeira pesada, incluindo titulos, parcelas, caixa, baixas, contas a pagar, produtos, estoque financeiro/fiscal, certificados e integracoes bancarias/fiscais.
- Impacto: qualquer alteracao financeira operacional deve ser analisada tambem no repositorio `C:\Sistemas\IA\Financeiro`; a documentacao da Escola deve registrar a dependencia e nao assumir que o financeiro vive somente dentro do monolito da Escola.
- Alternativas consideradas: manter o financeiro documentado como modulo interno da Escola; duplicar regra financeira no banco da Escola; acoplar nomenclaturas escolares ao core financeiro.
- Status: aceita

## DEC-0026

- Data: 2026-06-23
- Contexto: a tela `PRINCIPAL_GRADE` estava sendo tratada como lancamento de horarios de aula, mas o negocio exige que todo horario exista dentro de uma turma.
- Decisao: `PRINCIPAL_GRADE` passa a ser cadastro de turmas com horario das aulas. O lancamento operacional oficial e `class_schedule_items`, sempre com `schoolYearId`, `seriesClassId`, `dayOfWeek`, `startTime` e `endTime`; aulas usam `teacherSubjectId`, intervalos usam `teacherSubjectId = null`.
- Impacto: elimina cadastro operacional de horario solto, preserva isolamento por turma/ano/escola, permite intervalo na mesma grade e centraliza validacao de sobreposicao no backend.
- Alternativas consideradas: manter `schedules` como cadastro principal; criar tela separada de intervalos; duplicar horarios por periodo sem vinculo direto com turma.
- Status: aceita
