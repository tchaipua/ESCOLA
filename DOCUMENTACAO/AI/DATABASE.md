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

Tabela de filiais operacionais por escola.

Campos principais:

- `tenantId`
- `branchCode`
- `name`
- dados proprios da filial: logotipo, documento/CNPJ, contatos e endereco completo
- configuracao SMTP propria da filial, opcional, com os mesmos campos SMTP da empresa
- configuracao Telegram propria da filial, opcional, com token e usuario do bot
- configuracao de arquivos/storage propria da filial, opcional, compativel com S3/Contabo
- parametros operacionais de estoque por filial:
  - `stockControlMode`
  - `stockIntegerQuantityMode`
  - `stockLotControlMode`
  - `stockExpirationControlMode`
  - `stockGridControlMode`
  - `stockNegativeControlMode`
- `isActive`

Regras:

- a primeira filial criada automaticamente usa `branchCode = 1`
- `branchCode = 0` representa cadastro comum/visivel para todas as filiais
- ao cadastrar uma nova escola/empresa, a primeira filial operacional e criada automaticamente
- dados operacionais como logotipo, CNPJ, endereco e contatos devem ficar na filial, deixando a empresa/tenant com parametros gerais compartilhados
- se a filial possuir configuracao SMTP preenchida, ela tem prioridade sobre o SMTP da empresa; se nao possuir, o envio continua usando o SMTP da empresa ou variaveis de ambiente
- se a filial possuir configuracao Telegram preenchida, ela tem prioridade sobre o Telegram da empresa; se nao possuir, o envio continua usando o Telegram da empresa ou variaveis de ambiente
- se a filial possuir configuracao de storage preenchida, ela tem prioridade sobre o storage da empresa; se nao possuir, leitura/gravação de arquivos deve usar o storage da empresa
- parametros de estoque da filial aceitam `NO`, `YES` ou `BY_PRODUCT`; quando estiver `BY_PRODUCT`, a regra efetiva deve ser buscada no cadastro do produto
- se a escola possuir apenas uma filial ativa, o cadastro deve ser transparente para o usuario e gravado automaticamente na filial existente
- se a escola possuir mais de uma filial ativa, cadastros operacionais devem permitir escolher uma filial especifica ou comum a todas
- consultas de uma filial enxergam os registros da filial atual e os registros comuns (`0`)

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

### Regras de unicidade em `people`

Dentro do mesmo tenant:

- um `cpfDigits` identifica uma pessoa mestre
- um `email` identifica uma credencial compartilhada

Implementacao atual:

- `@@unique([tenantId, cpfDigits])`
- `@@unique([tenantId, email])`

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
- dados de Telegram e aceite/saida de notificacao
- definicao de pagador (`billingPayerType` e `billingGuardianId`) para integracao com o `Financeiro`

### `guardians`

- vinculos com alunos
- parentesco
- descricao de parentesco quando necessario
- dados de Telegram e aceite/saida de notificacao

## Sincronizacao entre pessoa e papeis

Campos compartilhados sao propagados entre `people` e os papeis vinculados:

- identificacao civil
- contato
- endereco
- credencial compartilhada

Objetivo:

- evitar divergencia entre cadastros repetidos
- permitir login unico com selecao de papel
- manter operacao especifica em cada modulo

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
- `people`, `students` e `guardians` guardam `telegramChatId`, `telegramUsername`, `telegramOptInAt` e `telegramOptOutAt`.
- `lesson_events` e `lesson_assessments` possuem `notifyByTelegram`.
- `notifications` registra `telegramSentAt`, `telegramStatus` e `telegramError`.
- o envio so pode ocorrer para aluno/responsavel com `telegramChatId`, `telegramOptInAt` preenchido e `telegramOptOutAt` vazio.

## Notificacoes por e-mail

- `tenants` e `tenant_branches` guardam configuracao SMTP.
- a resolucao usa filial primeiro, depois escola, depois variaveis `SMTP_HOST`, `SMTP_PORT`, `SMTP_TIMEOUT`, `SMTP_AUTHENTICATE`, `SMTP_SECURE`, `SMTP_EMAIL` e `SMTP_PASSWORD`.
- `lesson_events` e `lesson_assessments` possuem `notifyByEmail`.
- `notifications.emailedAt` registra quando a notificacao foi enviada por e-mail.

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

- O backend possui um fluxo master exclusivo para excluir fisicamente uma escola e todos os registros associados por `tenantId`
- Esse fluxo existe somente para administracao de softhouse e nao deve ser reutilizado em modulos operacionais
- O purge remove tambem os registros historicos daquele tenant e por isso exige confirmacao explicita do `tenantId`

## Observacao sobre legado

O banco legado ja tinha `teachers`, `students` e `guardians` com campos repetidos. A transicao atual usa backfill para criar `people` e preencher `personId` sem apagar nada.

## Financeiro operacional

Desde 2026-04-05, o banco da `Escola` nao mantem mais as tabelas operacionais de lotes e parcelas de mensalidade.

Regra oficial:

- `students` e `classes` continuam definindo valor e pagador
- titulos, parcelas e historico operacional de lancamentos ficam exclusivamente no projeto `Financeiro`
