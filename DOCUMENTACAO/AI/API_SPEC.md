# API_SPEC

## Convencoes gerais

- Base URL: `/api/v1`
- Formato: JSON
- Autenticacao: `Authorization: Bearer <access_token>`
- Tenant: derivado do token e validado no backend
- Filial: `branchCode` e derivado do token e pode ser informado em mutacoes de cadastros operacionais; `0` indica cadastro comum a todas as filiais
- Soft delete: cancelamento logico, nao remocao fisica, exceto no endpoint master exclusivo de purge definitivo de tenant
- Textos em uppercase, exceto senha

## Tenants

### GET `/tenants/current/branches`

- Autenticacao: JWT da escola logada
- Uso: lista filiais ativas da escola atual
- Regra: se nao houver filial cadastrada, o backend cria a primeira filial com `branchCode = 1`

### POST `/tenants/current/branches`

- Autenticacao: JWT da escola logada
- Uso: cria uma filial operacional para a escola atual
- Body:

```json
{
  "branchCode": 2,
  "name": "FILIAL CENTRO"
}
```

### GET `/tenants/:id/branches`

- Autenticacao: cabecalho `x-msinfor-master-pass`
- Uso: lista filiais de uma escola a partir da tela MSINFOR ADMIN
- Regra: garante a existencia da primeira filial com `branchCode = 1`

### POST `/tenants/:id/branches`

- Autenticacao: cabecalho `x-msinfor-master-pass`
- Uso: cria filial para uma escola a partir da tela MSINFOR ADMIN
- Body aceita `branchCode`, `name`, `logoUrl`, documento/CNPJ, contatos, endereco completo, SMTP proprio da filial, storage proprio da filial e parametros operacionais de estoque da filial
- SMTP da filial e opcional; quando informado, tem prioridade sobre o SMTP da empresa nos envios daquela filial. Quando vazio, o sistema usa o SMTP da empresa ou variaveis de ambiente.
- Telegram da filial e opcional; quando informado, tem prioridade sobre o Telegram da empresa nos envios daquela filial. Quando vazio, o sistema usa o Telegram da empresa ou variaveis de ambiente.
- Storage da filial e opcional; quando informado, tem prioridade sobre o storage da empresa nas operacoes de arquivo daquela filial. Quando vazio, o sistema usa o storage da empresa.
- Campos SMTP da filial:
  - `smtpHost`
  - `smtpPort`
  - `smtpTimeout`
  - `smtpAuthenticate`
  - `smtpSecure`
  - `smtpAuthType`
  - `smtpEmail`
  - `smtpPassword`
- Campos Telegram da filial:
  - `telegramEnabled`
  - `telegramBotToken`
  - `telegramBotUsername`
- Campos de storage da filial:
  - `storageProviderAccessKeyId`
  - `storageProviderSecretAccessKey`
  - `storageBucketName`
  - `storageFolderName`
  - `storageDefaultAcl`
  - `storageDefaultExpiration`
  - `storageRegion`
  - `storageEndpoint`
  - `storageCustomEndpoint`
- Parametros de estoque aceitam `NO`, `YES` ou `BY_PRODUCT`:
  - `stockControlMode`
  - `stockIntegerQuantityMode`
  - `stockLotControlMode`
  - `stockExpirationControlMode`
  - `stockGridControlMode`
  - `stockNegativeControlMode`

### PUT `/tenants/:id/branches/:branchId`

- Autenticacao: cabecalho `x-msinfor-master-pass`
- Uso: atualiza dados cadastrais e parametros operacionais da filial
- Restricao: `branchCode` nao pode repetir dentro da mesma escola

### GET `/tenants/:id/access-users`

- Autenticacao: cabecalho `x-msinfor-master-pass`
- Uso: lista usuarios administrativos da escola e as filiais liberadas para cada usuario
- Resposta inclui `branches`, `branchAccessCodes` e `branchAccesses`
- Regra: usuario com papel `ADMIN` deve ser interpretado como acesso a todas as filiais ativas, mesmo sem registros em `user_branch_accesses`

### POST `/tenants/:id/access-users`

- Autenticacao: cabecalho `x-msinfor-master-pass`
- Uso: cria usuario administrativo da escola
- Body aceita `name`, `email`, `password`, `role`, perfis/permissoes, `branchAccessCodes` e `cashierOnly`
- Regra: `branchAccessCodes` e obrigatorio para usuario nao-admin quando a escola possui mais de uma filial ativa
- Regra: para `role = ADMIN`, o backend ignora `branchAccessCodes` e libera todas as filiais
- Regra: `cashierOnly = true` em usuario nao-admin força o perfil complementar `CAIXA`; no login, o usuario cai direto em `PRINCIPAL_FINANCEIRO_VENDAS` e fica impedido de navegar pelo restante do painel

### PUT `/tenants/:id/access-users/:userId`

- Autenticacao: cabecalho `x-msinfor-master-pass`
- Uso: atualiza usuario administrativo e suas filiais liberadas
- Body aceita `branchAccessCodes` e `cashierOnly`
- Regra: omitir `branchAccessCodes` preserva os acessos atuais; enviar a lista substitui os vinculos ativos
- Regra: para `role = ADMIN`, os vinculos ativos sao cancelados logicamente e o acesso continua liberado para todas as filiais
- Regra: `cashierOnly = true` em usuario nao-admin força o perfil complementar `CAIXA`; no login, o usuario cai direto em `PRINCIPAL_FINANCEIRO_VENDAS` e fica impedido de navegar pelo restante do painel

### `branchCode` em cadastros operacionais

- `branchCode = 1..n`: registro restrito a filial informada
- `branchCode = 0`: registro comum a todas as filiais
- quando a escola possui apenas uma filial, o backend ignora a filial enviada e grava na filial existente
- endpoints de professor, aluno, responsavel, serie, turma, serie x turma, disciplina, ano letivo, horarios base, vinculo professor x disciplina e grade horaria aceitam `branchCode` nas mutacoes
- endpoints de professor, aluno e responsavel tambem aceitam `branchAccessCodes` para selecionar filiais especificas; lista vazia com `branchCode = 0` significa uso em todas as filiais
- quando `branchAccessCodes` possuir mais de uma filial, o cadastro fica com `branchCode = 0`, mas a visibilidade e o login respeitam apenas a lista informada

### DELETE `/tenants/:id`

- Autenticacao: cabecalho `x-msinfor-master-pass`
- Uso: cancela logicamente uma escola e suas dependencias
- Resultado: aplica `canceledAt` e `canceledBy`, preservando historico

### POST `/tenants/:id/purge`

- Autenticacao: cabecalho `x-msinfor-master-pass`
- Uso: exclui fisicamente uma escola e todos os registros associados ao `tenantId`
- Restricao: uso exclusivo da tela MSINFOR ADMIN
- Risco: operacao irreversivel

Body:

```json
{
  "confirmationTenantId": "uuid-da-escola",
  "confirmationPhrase": "EXCLUIR DEFINITIVAMENTE"
}
```

Resposta resumida:

```json
{
  "message": "Escola 'ESCOLA' excluída definitivamente com 123 registro(s) removido(s).",
  "tenantId": "uuid-da-escola",
  "deletedTotal": 123,
  "deleted": {
    "users": 3,
    "students": 40,
    "tenants": 1
  }
}
```

## Auth

### POST `/auth/login`

- Regra de escopo: este e um dos poucos fluxos com busca cross-tenant autorizada por e-mail
- Comportamento: o backend deve pesquisar o e-mail informado em todas as escolas para descobrir em quais tenants e perfis ele existe
- Restricao: depois da escolha da escola/perfil, o restante da sessao volta ao isolamento normal por `tenantId`
- Credencial: a senha valida passa a ser a da tabela global `email_credentials`, independente da escola logada

Body atual:

```json
{
  "email": "USUARIO_OU_EMAIL",
  "password": "SENHA",
  "tenantId": "opcional-quando-ha-mais-de-uma-escola",
  "accountId": "opcional-quando-ha-mais-de-um-papel",
  "accountType": "user|teacher|student|guardian",
  "branchCode": "opcional-quando-ha-mais-de-uma-filial"
}
```

Respostas possiveis:

### Sucesso

```json
{
  "status": "SUCCESS",
  "access_token": "jwt",
  "user": {
    "id": "uuid",
    "tenantId": "uuid",
    "branchCode": 1,
    "role": "PROFESSOR",
    "permissions": ["VIEW_DASHBOARD"],
    "branchAccessCodes": [1],
    "canAccessAllBranches": false
  }
}
```

### Multiplas escolas

```json
{
  "status": "MULTIPLE_TENANTS",
  "tenants": [
    { "id": "uuid", "name": "ESCOLA", "logoUrl": null }
  ]
}
```

### Multiplos acessos no mesmo login

```json
{
  "status": "MULTIPLE_ACCOUNTS",
  "accounts": [
    {
      "accountId": "uuid",
      "accountType": "teacher",
      "role": "PROFESSOR",
      "roleLabel": "PROFESSOR",
      "name": "NOME",
      "tenant": { "id": "uuid", "name": "ESCOLA", "logoUrl": null }
    }
  ]
}
```

### Multiplas filiais liberadas

```json
{
  "status": "MULTIPLE_BRANCHES",
  "tenant": { "id": "uuid", "name": "ESCOLA", "logoUrl": null },
  "account": {
    "accountId": "uuid",
    "accountType": "user",
    "role": "ADMIN",
    "roleLabel": "ADMINISTRADOR",
    "name": "NOME"
  },
  "branches": [
    { "id": "uuid", "branchCode": 1, "name": "FILIAL 1" },
    { "id": "uuid", "branchCode": 2, "name": "FILIAL 2" }
  ]
}
```

- Regra: usuarios `ADMIN` e acesso master recebem todas as filiais ativas para escolha
- Regra: usuarios nao-admin recebem somente as filiais presentes em `user_branch_accesses`

### E-mail pendente de confirmacao

```json
{
  "status": "EMAIL_CONFIRMATION_REQUIRED",
  "message": "SEU E-MAIL AINDA NAO FOI CONFIRMADO. ENVIAMOS UM LINK DE VERIFICACAO PARA O SEU ENDERECO."
}
```

- Regra principal:
  - o e-mail de verificacao e enviado usando as configuracoes gerais da softhouse
  - enquanto o e-mail nao for confirmado, o login nao conclui

### GET `/auth/verify-email`

- Uso: confirma o e-mail global a partir do token enviado por e-mail
- Query string:

```text
/auth/verify-email?token=TOKEN
```

### POST `/auth/forgot-password`

- aceita `email`
- Regra de escopo: a busca do e-mail acontece em todas as escolas
- Regra de credencial: o token de redefinicao passa a ser controlado em `email_credentials`
- Regra principal: como a senha agora e global por e-mail, o fluxo nao deve exigir escolha de escola para recuperar acesso
- Envio: usa as configuracoes gerais da softhouse

### POST `/auth/reset-password`

- redefine a senha por token
- atualiza a credencial global em `email_credentials`
- respeita trilha de auditoria

### POST `/auth/confirm-password`

- Autenticação: `Authorization: Bearer <access_token>`
- Body:

```json
{
  "password": "SENHA_ATUAL"
}
```

- Uso: confirma a identidade do usuário logado antes de operações sensíveis (inativação/exclusão) sem exigir um novo login.
- Resposta de sucesso:

```json
{
  "status": "SUCCESS"
}
```

- Em caso de senha inválida, retorna `401 Unauthorized` com a mensagem padrão `"Senha inválida."`.

### POST `/auth/confirm-shared-password`

- Autenticacao: `Authorization: Bearer <access_token>`
- Body:

```json
{
  "password": "SENHA_ATUAL"
}
```

- Uso: valida a senha atual pelo e-mail do usuario logado, pesquisando em todos os perfis e em todas as escolas vinculadas a esse e-mail
- Regra principal: se qualquer perfil do mesmo e-mail possuir a senha informada, a validacao deve retornar sucesso, mesmo que o cadastro atualmente logado tenha outra senha
- Fonte oficial da senha: `email_credentials`
- Resposta de sucesso:

```json
{
  "status": "SUCCESS"
}
```

### POST `/auth/confirm-cash-cancellation-password`

- Autenticacao: `Authorization: Bearer <access_token>`
- Body:

```json
{
  "password": "SENHA_ATUAL"
}
```

- Uso: valida a senha antes de cancelamentos sensiveis no detalhe do caixa financeiro embutido.
- Regra principal: aceita a senha do operador logado ou a senha de um usuario administrativo ativo da mesma escola com perfil supervisor financeiro (`ADMIN`, `MANAGE_FINANCIAL` ou `CLOSE_CASHIER`).
- Escopo: nunca valida supervisor de outra escola/tenant.
- Resposta de sucesso:

```json
{
  "status": "SUCCESS",
  "authorizedBy": "OPERADOR"
}
```

### POST `/auth/change-shared-password`

- Autenticacao: `Authorization: Bearer <access_token>`
- Body:

```json
{
  "currentPassword": "SENHA_ATUAL",
  "newPassword": "NOVA_SENHA"
}
```

- Uso: altera a senha compartilhada do e-mail exibido na tela `PRINCIPAL_MENU_ALTERAR_SENHA_EMAIL_GERAL`
- Regra de escopo: este fluxo pode pesquisar e atualizar registros em todas as escolas, exclusivamente para manter senha unica por e-mail
- Regra principal:
  - a senha atual deve ser validada pela credencial global do e-mail
  - a nova senha deve ser gravada na tabela global `email_credentials`
  - um e-mail deve possuir apenas uma senha valida no ecossistema

## People

### GET `/people`

Lista o cadastro mestre de pessoas da escola com os papeis vinculados.

Resposta resumida:

```json
[
  {
    "id": "uuid",
    "name": "NOME",
    "cpf": "000.000.000-00",
    "email": "LOGIN@ESCOLA.COM",
    "sharedLoginEnabled": true,
    "roles": [
      {
        "role": "PROFESSOR",
        "roleLabel": "PROFESSOR",
        "recordId": "uuid",
        "active": true,
        "accessProfile": "PROFESSOR_PADRAO",
        "permissions": ["VIEW_DASHBOARD"]
      }
    ]
  }
]
```

### GET `/people/:id`

Consulta uma pessoa mestre e os papeis vinculados no tenant atual.

### POST `/people`

Cria uma pessoa mestre e opcionalmente ja cria os papeis informados.

Regra atual:

- o campo `email` continua existindo no cadastro
- a senha nao deve mais ser informada nas telas operacionais de pessoa
- quando houver senha em integracao legada, ela serve apenas para semear `email_credentials`

Body resumido:

```json
{
  "name": "NOME",
  "cpf": "000.000.000-00",
  "email": "LOGIN@ESCOLA.COM",
  "roles": [
    { "role": "PROFESSOR", "accessProfile": "PROFESSOR_PADRAO" },
    { "role": "RESPONSAVEL", "accessProfile": "RESPONSAVEL_CONSULTA" }
  ]
}
```

### PATCH `/people/:id`

Atualiza o cadastro mestre e cria/atualiza papeis sem duplicar a pessoa.

Regra importante:

- papeis enviados sao criados ou atualizados
- papeis existentes nao sao removidos automaticamente
- para inativar um papel, usa-se a tela/fluxo operacional daquele modulo

## Shared profiles

### GET `/shared-profiles/cpf/:cpf`

Consulta dados compartilhados por CPF dentro do tenant atual.

Uso principal:

- reaproveitar cadastro basico
- detectar que a mesma pessoa ja existe em outro papel
- preencher formulario sem repetir digitacao

### GET `/shared-profiles/email/:email`

Consulta dados compartilhados por e-mail dentro do tenant atual.

Uso principal:

- reaproveitar credencial e dados compartilhados por login
- identificar multiplos papeis da mesma pessoa

### GET `/shared-profiles/name-suggestions/:name?limit=8`

Consulta sugestoes de nomes ja cadastrados com busca tolerante a acentos, abreviacoes e trechos parciais (ex.: sobrenome).

Convencao de escopo:

- quando o requisito mencionar "pesquisar em pessoas", esta busca deve considerar de forma consolidada:
  - `teachers`
  - `students`
  - `guardians`
  - `users`
  - `people` (cadastro mestre), quando aplicavel

Resposta resumida:

```json
[
  {
    "name": "NOME DA PESSOA",
    "roles": ["PROFESSOR", "RESPONSAVEL"],
    "cpf": "000.000.000-00",
    "email": "LOGIN@ESCOLA.COM",
    "active": true
  }
]
```

### GET `/shared-profiles/email-usage/:email`

- Uso: consulta administrativa para descobrir em quais cadastros e escolas um e-mail esta sendo usado
- Excecao de escopo: pode retornar referencias de varias escolas, mas nao libera dados operacionais completos cross-tenant

## Modulos operacionais por papel

Continuam existindo e agora atuam como area operacional especializada:

- `/teachers`
- `/students`
- `/guardians`

- leem e gravam dados comuns em `people`
- respeitam tenant e auditoria
- mantem campos especificos do papel

## Anos letivos e feriados

### POST/PATCH `/school-years`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Permissao: `MANAGE_SCHOOL_YEARS`
- Uso: cria ou atualiza ano letivo na tela `PRINCIPAL_CONFIGURA_ANO_LETIVO`.
- Regra: o cadastro respeita tenant/filial, auditoria e cancelamento logico.
- Regra: os dias com aula indicam em quais dias da semana a escola normalmente possui aula naquele ano letivo.
- Padrao para novos anos: segunda a sexta com aula; sabado e domingo sem aula.

Body resumido:

```json
{
  "branchCode": 1,
  "year": 2026,
  "startDate": "2026-02-02",
  "endDate": "2026-12-18",
  "isActive": true,
  "monday": true,
  "tuesday": true,
  "wednesday": true,
  "thursday": true,
  "friday": true,
  "saturday": false,
  "sunday": false
}
```

### GET `/school-years/import-holidays`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Permissao: `VIEW_SCHOOL_YEARS`
- Uso: consulta feriados nacionais na BrasilAPI para preencher a aba de feriados da tela `PRINCIPAL_CONFIGURA_ANO_LETIVO`.
- Regra: a consulta externa nao exige chave e retorna somente feriados nacionais; a persistencia da lista conferida pela tela ocorre em `PUT /school-years/holidays`.

Query string:

```text
/school-years/import-holidays?year=2026
```

- A importacao usa BrasilAPI sem chave para feriados nacionais.
- Nao ha importacao automatica estadual ou municipal; esses feriados devem ser cadastrados manualmente no sistema.

Resposta resumida:

```json
{
  "scope": "NACIONAL",
  "year": 2026,
  "source": "BRASIL_API",
  "holidays": [
    {
      "date": "2026-01-01",
      "name": "CONFRATERNIZACAO MUNDIAL",
      "type": "NACIONAL",
      "source": "BRASIL_API"
    }
  ]
}
```

### GET `/school-years/holidays`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Permissao: `VIEW_SCHOOL_YEARS`
- Uso: lista os feriados cadastrados para o ano letivo na escola/filial atual.
- Regra: a consulta respeita `tenantId`, mostra feriados comuns (`branchCode = 0`) e da filial atual, e ignora registros cancelados logicamente.

Query string:

```text
/school-years/holidays?year=2026
```

### PUT `/school-years/holidays`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Permissao: `MANAGE_SCHOOL_YEARS`
- Uso: salva a lista de feriados da aba `Feriados` para o ano letivo.
- Regra: os feriados enviados sao gravados/reativados; feriados do mesmo ano/filial que nao vierem no payload sao cancelados logicamente com `canceledAt/canceledBy`.
- Regra: textos sao normalizados em uppercase e cada feriado deve pertencer ao ano informado.
- Regra: o cadastro de feriado nao trata turma; feriados valem para o calendario da escola/filial no ano informado.

Body resumido:

```json
{
  "branchCode": 1,
  "year": 2026,
  "holidays": [
    {
      "date": "2026-01-01",
      "name": "CONFRATERNIZACAO MUNDIAL",
      "type": "NACIONAL",
      "source": "BRASIL_API"
    }
  ]
}
```

## Grade horaria por turma

### Endpoints principais

- `GET /class-schedule-items`
- `POST /class-schedule-items`
- `PATCH /class-schedule-items/:id`
- `PATCH /class-schedule-items/:id/status`
- `DELETE /class-schedule-items/:id` como compatibilidade tecnica, sempre com cancelamento logico

### Regra oficial de lancamento

- A tela `PRINCIPAL_GRADE` representa cadastro de turmas com horario das aulas.
- Nao deve existir lancamento operacional de horario solto sem turma.
- Todo registro da grade semanal deve gravar obrigatoriamente `schoolYearId`, `seriesClassId`, `dayOfWeek`, `startTime` e `endTime`.
- Aula comum deve gravar `teacherSubjectId`, apontando para o vinculo professor x disciplina.
- Intervalo deve ser gravado no mesmo endpoint, vinculado a turma e dia, com `teacherSubjectId = null`.
- O backend deve bloquear sobreposicao de horario na mesma turma/dia e tambem conflito de professor em turmas diferentes quando houver `teacherSubjectId`.
- Inativacao deve usar `canceledAt/canceledBy`; nao ha delete fisico operacional.

Body de aula:

```json
{
  "branchCode": 1,
  "schoolYearId": "uuid-ano-letivo",
  "seriesClassId": "uuid-serie-turma",
  "dayOfWeek": "SEGUNDA",
  "teacherSubjectId": "uuid-professor-disciplina",
  "startTime": "07:00",
  "endTime": "07:45"
}
```

Body de intervalo:

```json
{
  "branchCode": 1,
  "schoolYearId": "uuid-ano-letivo",
  "seriesClassId": "uuid-serie-turma",
  "dayOfWeek": "SEGUNDA",
  "teacherSubjectId": null,
  "startTime": "07:45",
  "endTime": "08:00"
}
```

### GET `/students/me/pwa-summary`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfil esperado: `ALUNO`
- Uso: entrega o resumo do PWA do aluno com cadastro proprio, turma atual, historico de frequencia, frequencia por materia, notas, medias por materia e timestamp de sincronizacao.

Resposta resumida:

```json
{
  "student": {
    "id": "uuid",
    "name": "ALUNO",
    "email": "LOGIN@ESCOLA.COM"
  },
  "currentEnrollment": {
    "schoolYear": 2026,
    "seriesName": "6 ANO",
    "className": "A"
  },
  "attendance": {
    "totalLessons": 120,
    "overallFrequency": 94.16,
    "bySubject": [
      {
        "subjectName": "MATEMATICA",
        "frequency": 96.42
      }
    ]
  },
  "grades": {
    "overallAverage": 8.4,
    "bySubject": [
      {
        "subjectName": "MATEMATICA",
        "averageScore": 8.8
      }
    ]
  },
  "syncedAt": "2026-03-25T12:00:00.000Z"
}
```

### GET `/guardians/me/pwa-summary`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfil esperado: `RESPONSAVEL`
- Uso: entrega o resumo do PWA do responsavel com seus alunos vinculados, dados academicos consolidados por aluno, frequencia, notas, medias e timestamp de sincronizacao.

Resposta resumida:

```json
{
  "guardian": {
    "id": "uuid",
    "name": "RESPONSAVEL"
  },
  "students": [
    {
      "id": "uuid-vinculo",
      "kinship": "MAE",
      "student": {
        "student": {
          "id": "uuid-aluno",
          "name": "ALUNO"
        },
        "currentEnrollment": {
          "schoolYear": 2026,
          "seriesName": "6 ANO",
          "className": "A"
        },
        "attendance": {
          "overallFrequency": 94.16
        },
        "grades": {
          "overallAverage": 8.4
        }
      }
    }
  ],
  "syncedAt": "2026-03-25T12:00:00.000Z"
}
```

### POST `/lesson-events/admin`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Permissao: `MANAGE_LESSON_CALENDARS`
- Uso: permite lancar `PROVA` ou `TRABALHO` em nome do professor a partir da tela `PRINCIPAL_GRADE_ANUAL`.
- Body:

```json
{
  "lessonCalendarItemId": "uuid",
  "eventType": "PROVA",
  "title": "PROVA BIMESTRAL",
  "description": "CONTEUDO DO CAPITULO 3",
  "notifyStudents": true,
  "notifyGuardians": true,
  "notifyByEmail": true,
  "notifyByTelegram": true
}
```

- Regra: notificar por Telegram exige bot configurado na escola/filial ou em `TELEGRAM_BOT_TOKEN`, alem de `telegramChatId` com opt-in ativo no aluno/responsavel.
- Regra: notificar por e-mail exige SMTP configurado na escola/filial ou nas variaveis `SMTP_HOST`, `SMTP_PORT` e `SMTP_EMAIL`; quando enviado, a notificacao registra `emailedAt`.

### POST `/communications`

- Autenticacao: `Authorization: Bearer <access_token>`
- Uso: envia comunicado interno, por e-mail e/ou por Telegram conforme permissao do perfil.
- Body resumido:

```json
{
  "title": "REUNIAO DE PAIS",
  "message": "REUNIAO AS 19H.",
  "sendInternal": true,
  "sendEmail": true,
  "sendTelegram": true,
  "recipientGroups": ["RESPONSAVEIS"]
}
```

- Regra: `sendTelegram` entrega apenas para alunos/responsaveis com `telegramChatId` e opt-in ativo; funcionarios/professores continuam por notificacao interna/e-mail ate existir cadastro de Telegram nesses papeis.

### POST `/notifications/my/read-batch`

- Autenticacao: `Authorization: Bearer <access_token>`
- Uso: sincroniza em lote notificacoes marcadas como lidas no modo offline do PWA.

Body:

```json
{
  "ids": ["uuid-1", "uuid-2"]
}
```

Resposta resumida:

```json
{
  "updatedCount": 2
}
```

## Configurações de notificações por usuário

### GET `/notification-settings/users`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Uso: lista as pessoas do tenant atual com status de e-mail validado e dados de Telegram para envio de notificacoes.
- Escopo: sempre restrito ao `tenantId` da sessao.
- Origem dos registros:
  - `people` como fonte oficial de nome, e-mail e Telegram
  - `teachers`, `students` e `guardians` apenas para montar as etiquetas de papeis vinculados
  - `email_credentials` para status de validacao do e-mail

Resposta resumida:

```json
[
  {
    "id": "uuid",
    "sourceType": "GUARDIAN",
    "sourceLabel": "RESPONSAVEL",
    "name": "NOME",
    "email": "EMAIL@ESCOLA.COM",
    "emailVerified": true,
    "emailVerifiedAt": "2026-06-26T10:00:00.000Z",
    "telegramChatId": "123456789",
    "telegramUsername": "@USUARIO",
    "telegramEnabled": true,
    "active": true
  }
]
```

### POST `/notification-settings/users/send-email-confirmation`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Uso: envia um link de confirmacao para validar se o e-mail informado esta correto.
- Regra: a confirmacao reutiliza `email_credentials`; ao clicar no link recebido, o e-mail passa a ser marcado como validado globalmente.

Body:

```json
{
  "email": "USUARIO@ESCOLA.COM"
}
```

### PATCH `/notification-settings/users/:personId`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Uso: atualiza e-mail e dados de Telegram da pessoa central sem precisar abrir o cadastro original.
- Regra: a gravacao acontece em `people`; os papeis vinculados por `personId` apenas consomem esses dados.
- Regra: se o e-mail for alterado, ele fica sujeito a validacao em `email_credentials`.

Body:

```json
{
  "email": "USUARIO@ESCOLA.COM",
  "telegramChatId": "123456789",
  "telegramUsername": "@USUARIO",
  "telegramOptInEnabled": true
}
```

## Telegram

### POST `/telegram/configure-webhook`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Uso: configura no Telegram o webhook da escola logada usando o token salvo no cadastro da escola.
- Regra: a URL publica da API deve estar em `BACKEND_PUBLIC_URL`, `PUBLIC_API_URL` ou `API_PUBLIC_URL`; em ambiente local a URL gerada com `localhost` serve apenas para conferencia, pois o Telegram nao consegue chamar a maquina local.

### GET `/telegram/webhook-status`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Uso: consulta no Telegram qual webhook esta configurado e quantas mensagens estao pendentes.

### POST `/telegram/poll-updates`

- Autenticacao: `Authorization: Bearer <access_token>`
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Uso: busca manualmente mensagens pendentes do Telegram via `getUpdates`.
- Regra: usado principalmente em ambiente local/testes, quando o Telegram nao consegue chamar um webhook em `localhost`.

### POST `/telegram/webhook/:tenantId/:secret`

- Rota publica chamada pelo Telegram.
- `tenantId`: escola que recebera a mensagem.
- `secret`: hash derivado do token do bot configurado para impedir postagens externas indevidas.
- Fluxo:
  - se a pessoa enviar `oi`, `ola` ou `/start`, o bot pede CPF/CNPJ;
  - se enviar CPF/CNPJ valido e existente em `people`, grava `telegramChatId`, `telegramUsername`, `telegramOptInAt` e limpa `telegramOptOutAt`;
  - a gravacao fica em `people` e os papeis vinculados consomem esses dados via `personId`;
  - se enviar `sair`, `parar`, `cancelar` ou `stop`, o bot registra opt-out.

## Regras de payload importantes

- Campos textuais devem ser normalizados para uppercase, exceto senha
- CPF/CNPJ devem ser validados quando informados
- Nao pode haver violacao de tenant
- Nao existe delete fisico nos dados de negocio

## Turmas

### POST/PATCH `/series-classes`

- Autenticacao: `Authorization: Bearer <access_token>`
- Uso: cria/atualiza o vinculo serie x turma e pode cadastrar SMTP especifico da turma.
- Regra: quando `smtpEnabled = true`, o envio de e-mail da agenda escolar tenta usar primeiro a configuracao desta turma; se nao houver configuracao completa, cai para filial, escola e ambiente.
- Regra: em edicao, senha SMTP vazia nao apaga a senha ja gravada.

Campos SMTP opcionais:

```json
{
  "smtpEnabled": true,
  "smtpHost": "SMTP.GMAIL.COM",
  "smtpPort": 465,
  "smtpTimeout": 60,
  "smtpAuthenticate": true,
  "smtpSecure": true,
  "smtpAuthType": "SSL",
  "smtpEmail": "TURMA@ESCOLA.COM",
  "smtpPassword": "app-password",
  "smtpSenderName": "5 ANO A",
  "smtpReplyTo": "SECRETARIA@ESCOLA.COM"
}
```

## Caixa financeiro integrado

Observacao estrutural obrigatoria:

- o `Financeiro` fica no repositorio separado `C:\Sistemas\IA\Financeiro`
- a API propria do `Financeiro` roda localmente em `localhost:3002`
- o painel proprio do `Financeiro` roda localmente em `localhost:3003`
- os endpoints abaixo representam a camada consumida/exposta pela `Escola` para operar o financeiro integrado, mas a regra operacional financeira deve ser conferida tambem em `C:\Sistemas\IA\Financeiro\DOCUMENTACAO\AI\API_SPEC.md`

### GET `/financial-cashier/current-session`

- Autenticacao: `Authorization: Bearer <access_token>`
- Permissao: `VIEW_CASHIER`
- Uso: consulta o caixa aberto do usuario logado no `Financeiro`

### POST `/financial-cashier/open-session`

- Autenticacao: `Authorization: Bearer <access_token>`
- Permissao: `VIEW_CASHIER`
- Uso: abre caixa para o usuario logado na escola atual

### POST `/financial-cashier/close-session`

- Autenticacao: `Authorization: Bearer <access_token>`
- Permissao: `CLOSE_CASHIER`
- Uso: fecha o caixa aberto do usuario logado

### GET `/financial-cashier/installments`

- Autenticacao: `Authorization: Bearer <access_token>`
- Permissao: `VIEW_CASHIER`
- Uso: lista parcelas do `Financeiro` para a escola atual
- Query string opcional:
  - `status`: `OPEN | PAID | OVERDUE | ALL`
  - `studentName`
  - `payerName`

### GET `/financial-cashier/open-installments`

- Autenticacao: `Authorization: Bearer <access_token>`
- Permissao: `VIEW_CASHIER`
- Uso: alias legado para listar apenas parcelas em aberto no `Financeiro`

### POST `/financial-cashier/installments/:installmentId/settle-cash`

- Autenticacao: `Authorization: Bearer <access_token>`
- Permissao: `SETTLE_RECEIVABLES`
- Uso: registra baixa em dinheiro no `Financeiro`
- Regra obrigatoria: o usuario precisa ter caixa aberto na escola atual

### POST `/student-financial-launches/sync-payers`

- Autenticacao: `Authorization: Bearer <access_token>`
- Permissao: `VIEW_FINANCIAL`
- Uso: sincroniza no `Financeiro` todos os alunos ou responsáveis atualmente definidos como pagadores na filial
- Regra: o pagador aparece no cadastro de clientes do `Financeiro` mesmo sem título ou parcela
- Fonte oficial: dados de identidade e contato permanecem em `people` na Escola
