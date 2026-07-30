# DATABASE

## Objetivo

Documentar o modelo atual de dados com foco nas regras obrigatorias do projeto.

## Regras globais obrigatorias

- Todo dado de negocio pertence a um `tenantId`
- Dados operacionais com escopo de filial tambem possuem `branchCode`
- Nao existe delete fisico em negocio, exceto no purge fisico definitivo de tenant acionado pelo MSINFOR ADMIN master
- Toda mutacao precisa de auditoria
- Textos ficam em uppercase, exceto senha
- Isolamento total entre escolas

## Filiais

### `tenant_branches`

Projecao minima das filiais oficiais cadastradas no `MSINFOR_CENTRAL_IA`.

Campos principais:

- `tenantId`
- `branchCode`
- `name` tecnico (`FILIAL N`), sem autoridade cadastral
- `isActive` e cancelamento logico, sincronizados a partir do status central
- colunas de auditoria

Regras:

- `branchCode = 0` representa cadastro comum/visivel para todas as filiais
- a criacao e a manutencao de filial ocorrem exclusivamente na Central
- a Escola cria/atualiza somente a projecao minima ao consultar a lista central
- CNPJ, logotipo, endereco, contatos, S3, SMTP, Telegram e parametros
  financeiros/comerciais presentes em colunas legadas nao sao fonte de leitura
  nem de gravacao; permanecem temporariamente apenas para migracao sem perda
- cada criacao ou mudanca de status da projecao gera auditoria append-only sem
  segredos
- se a escola possuir apenas uma filial ativa, o cadastro deve ser transparente para o usuario e gravado automaticamente na filial existente
- se a escola possuir mais de uma filial ativa, cadastros operacionais devem permitir escolher uma filial especifica ou comum a todas
- consultas de uma filial enxergam os registros da filial atual e os registros comuns (`0`)

### `finance_source_parameter_audit_events`

Trilha append-only que inclui a criacao/sincronizacao da projecao minima de
filiais recebida da Central. Registra tenant, codigo, status, ator e data; dados
cadastrais e credenciais nunca sao armazenados nessa auditoria. O callback
legado do Financeiro que alterava parametros locais esta desativado.

### `user_branch_accesses`

Tabela de autorizacao de filiais para usuarios administrativos da escola.

Campos principais:

- `tenantId`
- `userId`
- `branchCode`
- `isDefault`
- colunas de auditoria e cancelamento logico

Regras:

- somente usuarios administrativos da tabela `users` usam esta tabela
- usuarios com papel `ADMIN` nao precisam de vinculos nesta tabela e podem acessar qualquer filial ativa da escola
- usuarios nao-admin devem possuir pelo menos uma filial liberada quando a escola tem mais de uma filial ativa
- ao fazer login em escola com mais de uma filial liberada, o usuario escolhe a filial da sessao
- o `branchCode` escolhido entra no token e passa a escopar consultas e mutacoes operacionais
- usuarios administrativos possuem `cashierOnly`; quando verdadeiro, o login direciona direto para `PRINCIPAL_FINANCEIRO_VENDAS`, força perfil complementar `CAIXA` e bloqueia navegacao pelo restante do painel
- cancelar um usuario administrativo tambem cancela logicamente seus vinculos de filial

### Filiais liberadas por papel operacional

As tabelas `teacher_branch_accesses`, `student_branch_accesses` e `guardian_branch_accesses` controlam selecao parcial de filiais para professores, alunos e responsaveis.

Regras:

- `branchCode = 0` sem vinculos ativos significa uso em todas as filiais
- quando o cadastro usa apenas algumas filiais, a tabela do papel guarda os `branchCode` liberados
- o login de professor, aluno e responsavel deve oferecer somente as filiais liberadas no cadastro
- consultas na filial atual exibem o cadastro comum a todas ou o cadastro com vinculo explicito para a filial atual

## Colunas base obrigatorias

Padrao minimo para entidades de negocio:

- `id`
- `tenantId`
- `branchCode` quando a entidade for operacional por filial
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `canceledAt`
- `canceledBy`

## Cadastro mestre de pessoa

### `people`

Tabela mestre para identidade compartilhada por escola.

Campos principais:

- `name`
- `birthDate`
- `rg`
- `cpf`
- `cpfDigits`
- `cnpj`
- `cnpjNormalized`
- `nickname`
- `corporateName`
- `phone`
- `whatsapp`
- `cellphone1`
- `cellphone2`
- `email`
- `telegramChatId`
- `telegramUsername`
- `telegramOptInAt`
- `telegramOptOutAt`
- `password`
- `resetPasswordToken`
- `resetPasswordExpires`
- `zipCode`
- `street`
- `number`
- `city`
- `state`
- `neighborhood`
- `complement`
- `mergedIntoPersonId`
- `mergedAt`
- `mergedBy`
- `mergeReason`

### Regras de unicidade em `people`

Dentro do mesmo tenant:

- um `cpfDigits` identifica uma pessoa mestre
- um `cnpjNormalized` identifica uma pessoa jurídica, inclusive com CNPJ alfanumérico
- a identidade é única no tenant, independentemente da filial em que o papel é exercido
- e-mail não identifica pessoa e pode ser compartilhado por familiares ou contatos administrativos

Implementacao atual:

- `@@unique([tenantId, cpfDigits])`
- `@@unique([tenantId, cnpjNormalized])`
- duplicidades legadas são preservadas com `mergedIntoPersonId`, cancelamento lógico e referências operacionais apontadas para a pessoa canônica

## Papeis operacionais

As tabelas abaixo continuam armazenando campos e relacoes especificas de operacao:

- `teachers`
- `students`
- `guardians`

Cada uma possui `personId` opcional apontando para `people`.

## Regra funcional de modelagem

Uma pessoa pode ter varios papeis na mesma escola.

Exemplos validos:

- um professor tambem ser responsavel
- um responsavel tambem ser aluno
- um cadastro base alimentar mais de um papel sem repetir CPF, data de nascimento, endereco e credencial

## O que permanece especifico por papel

### `teachers`

- perfil de acesso do professor
- permissoes especificas
- disciplinas vinculadas
- valor por aula e historico de valores

### `students`

- matriculas
- turma/serie
- foto
- mensalidade
- observacoes academicas
- definicao de pagador (`billingPayerType` e `billingGuardianId`) para integracao com o `Financeiro`

### `guardians`

- vinculos com alunos
- parentesco
- descricao de parentesco quando necessario

## Sincronizacao entre pessoa e papeis

Campos compartilhados ficam somente em `people`:

- identificacao civil
- contato
- endereco
- credencial compartilhada

Objetivo:

- evitar divergencia entre cadastros repetidos
- permitir login unico com selecao de papel
- manter operacao especifica em cada modulo

`teachers`, `students` e `guardians` possuem apenas `personId`, dados de acesso/permissao especificos do papel e campos operacionais do papel. Nome, contato, endereco, Telegram e credencial ficam fora dessas tabelas.

## Login e senha

A credencial compartilhada agora deve ser controlada prioritariamente em:

- `email_credentials`

Campos principais:

- `email`
- `passwordHash`
- `emailVerified`
- `verifiedAt`
- `verificationToken`
- `verificationExpires`
- `resetPasswordToken`
- `resetPasswordExpires`

Legado ainda existente no banco:

- `users`
- `people`
- `teachers`
- `students`
- `guardians`

A regra aplicada agora e:

- a senha valida do ecossistema passa a ser a da tabela global por `email`
- a verificacao de e-mail passa a ser global por `email`
- os campos de senha legados deixam de ser o ponto oficial de controle

## Soft delete

Cancelamento logico continua obrigatorio.

- desativar papel nao remove a pessoa
- desativar pessoa nao deve apagar historico de papel
- relacoes historicas continuam preservadas

## Notificacoes Telegram

- `tenants` e `tenant_branches` guardam `telegramEnabled`, `telegramBotToken` e `telegramBotUsername`.
- `people` guarda `telegramChatId`, `telegramUsername`, `telegramOptInAt` e `telegramOptOutAt`.
- `telegram_processed_updates` deduplica `update_id` por escola entre reinicios e replicas.
- `telegram_pending_actions` guarda por 15 minutos o estado curto da conversa, sem depender da memoria de uma replica.
- `lesson_events` e `lesson_assessments` possuem `notifyByTelegram`.
- `notifications` registra `telegramSentAt`, `telegramStatus` e `telegramError`.
- o envio so pode ocorrer para aluno/responsavel com `telegramChatId`, `telegramOptInAt` preenchido e `telegramOptOutAt` vazio.
- o webhook do Telegram nao vincula automaticamente por CPF/CNPJ: a secretaria valida a identidade fora do chat e registra o Chat ID; os envios para alunos/responsaveis/professores usam o `personId` para ler os dados de Telegram da pessoa central.
- `people(tenantId, telegramChatId)` e unico quando o Chat ID esta preenchido.

## Notificacoes por e-mail

- `tenants`, `tenant_branches` e `series_classes` ainda possuem colunas SMTP
  legadas, preservadas temporariamente para migracao sem perda.
- o runtime nao le essas colunas nem variaveis `SMTP_*` para configuracao de
  empresa/filial/turma; todo envio resolve exclusivamente o SMTP efetivo da API
  do MSINFOR Central (`BRANCH > TENANT > SYSTEM > GLOBAL`).
- `lesson_events` e `lesson_assessments` possuem `notifyByEmail`.
- `notifications.emailedAt` registra quando a notificacao foi enviada por e-mail.

## Feriados escolares

### `school_holidays`

Tabela oficial para os feriados cadastrados na tela `PRINCIPAL_CONFIGURA_ANO_LETIVO`.

Campos principais:

- `tenantId`
- `branchCode`
- `year`
- `date`
- `name`
- `holidayType`
- `appliesTo`
- `source`
- colunas de auditoria e cancelamento logico

Regras:

- feriados nacionais podem ser consultados na BrasilAPI sem chave e salvos pela tela.
- feriados estaduais, municipais, facultativos e escolares sao cadastrados manualmente.
- a tela nao trata turma no cadastro de feriados; o feriado vale para o calendario da escola/filial no ano.
- consultas respeitam `tenantId` e mostram registros da filial atual e registros comuns (`branchCode = 0`).
- remover feriado na tela cancela logicamente o registro; nao existe delete fisico operacional.
- textos sao normalizados em uppercase.

## Grade horaria semanal

### `class_schedule_items`

Tabela oficial para cadastro de turmas com horario das aulas na tela `PRINCIPAL_GRADE`.

Campos principais:

- `tenantId`
- `branchCode`
- `schoolYearId`
- `seriesClassId`
- `teacherSubjectId`
- `dayOfWeek`
- `startTime`
- `endTime`
- colunas de auditoria e cancelamento logico

Regras:

- `seriesClassId` e obrigatorio; nao existe lancamento operacional de horario solto sem turma.
- aula comum usa `teacherSubjectId` preenchido com o vinculo professor x disciplina.
- intervalo tambem pertence a turma e ao dia da semana, mas usa `teacherSubjectId = null`.
- o backend deve impedir sobreposicao de horario na mesma turma/dia.
- quando houver professor vinculado, o backend tambem deve impedir aula sobreposta do mesmo professor em outra turma.
- inativacao usa `canceledAt/canceledBy`; delete fisico operacional permanece proibido.

### `schedules`

Tabela legada/auxiliar de horarios base por periodo.

Regra atual:

- nao deve ser usada como lancamento operacional solto da grade.
- a tela `PRINCIPAL_GRADE` deve operar sobre `class_schedule_items`, sempre vinculando ano letivo, turma, dia e faixa de horario.

## Excecao de purge fisico de tenant

- A rota local historica existe apenas para responder `410 Gone`; nenhum segredo ou token a reativa.
- Uma futura exclusao fisica pertence ao MSINFOR Central e exige identidade forte, MFA, auditoria e confirmacao explicita do `tenantId`.

## Observacao sobre legado

O banco legado ja tinha `teachers`, `students` e `guardians` com campos repetidos.

Regra atual:

- `people` e a fonte oficial de CPF/CNPJ, RG, nascimento, contato, e-mail, Telegram e endereco.
- `people` e tambem a fonte oficial de nome e senha legada da pessoa.
- `teachers`, `students` e `guardians` devem guardar apenas dados especificos do papel, vinculos, permissao/acesso do papel e referencias operacionais.
- Em 2026-06-29 os dados comuns duplicados dos perfis foram copiados para `people` quando faltavam e limpos dos perfis no banco de teste.
- Em 2026-06-29 os campos comuns foram removidos fisicamente de `teachers`, `students` e `guardians` por migration. A fonte oficial passou a ser exclusivamente `people`.
- Em 2026-06-29 os campos legados `name`, `password`, `resetPasswordToken` e `resetPasswordExpires` tambem foram removidos fisicamente de `teachers`, `students` e `guardians`.
- O fluxo de Telegram nao recebe CPF/CNPJ para criar vinculo; a identidade deve ser validada administrativamente.

## Configuracoes globais da softhouse

- `global_settings` permanece no banco da Escola somente como registro legado de migração; novas leituras e mutações master usam a API do `MSINFOR_CENTRAL_IA`.
- O banco independente central mantém `central_settings`, `central_setting_audit_events` e `system_clients`.
- Valores de configuração são criptografados com AES-256-GCM; chaves dos sistemas são persistidas somente como hash.
- A Central mantém somente identidade, UUID/código do tenant e roteamento de
  acesso por sistema/banco; dados acadêmicos e financeiros continuam fora do
  banco central.

## Vínculo de identidade e sessões

- `tenants.centralTenantId`: UUID global único devolvido pela Central e usado
  para localizar o tenant local.
- `tenants.centralTenantCode`: código global único para operação e auditoria.
- `email_credentials.centralIdentityAccountId`: vínculo único da credencial
  legada com a conta central; depois do vínculo a senha e os tokens locais são
  limpos.
- `auth_sessions`: sessão revogável com `jti` aleatório, tenant, usuário, tipo
  de conta, filial, provedor de identidade, validade e cancelamento.
- Não há chave estrangeira de `auth_sessions.userId` porque o identificador pode
  pertencer a `users`, `teachers`, `students` ou `guardians`; a validação
  correspondente é obrigatória no guard de autenticação.

## Financeiro operacional

Desde 2026-04-05, o banco da `Escola` nao mantem mais as tabelas operacionais de lotes e parcelas de mensalidade.

Regra oficial:

- `students` e `classes` continuam definindo valor e pagador
- titulos, parcelas e historico operacional de lancamentos ficam exclusivamente no projeto `Financeiro`

## Segredos e artefatos locais

- Banco SQLite, snapshots, backups, arquivos `.sqlite`, logs e scripts temporarios de token nao podem ser versionados nem entrar na imagem Docker.
- Testes E2E devem criar seu banco temporario diretamente pelo schema Prisma e nunca depender de um snapshot `.db` versionado.
- A remocao do worktree nao apaga versoes antigas do Git; a higienizacao do historico exige operacao coordenada e rotacao posterior de todas as credenciais potencialmente expostas.
- SMTP, Telegram e S3 persistidos em `tenants`, `tenant_branches`, `series_classes` e no JSON legado de `global_settings` usam envelope `enc:v1` com AES-256-GCM.
- `DATA_ENCRYPTION_KEY` deve representar exatamente 32 bytes; em producao sua ausencia ou formato invalido impede o startup.
- A migracao de inicializacao valida ciphertext existente, cria backup local criptografado e converte somente valores em texto puro; a segunda execucao nao regrava dados.
- Consumidores internos descriptografam apenas no momento de enviar e-mail, Telegram, storage ou sincronizacao backend a backend; DTOs e logs nunca recebem o valor.

## PostgreSQL paralelo e RLS

- SQLite em `backend/prisma/schema.prisma` continua como ponte de desenvolvimento/teste.
- O schema PostgreSQL esta em `backend/prisma/postgresql/schema.prisma` e seu baseline fica fora de `backend/prisma/migrations`.
- O SQL RLS manual descobre tabelas com `tenantId`, habilita `ENABLE/FORCE ROW LEVEL SECURITY` e aplica `USING`/`WITH CHECK`.
- RLS nao entra no deploy automatico ate a identidade Central, o papel sem `BYPASSRLS` e o contexto por `set_config(..., true)` na mesma transacao estarem implementados e testados.
