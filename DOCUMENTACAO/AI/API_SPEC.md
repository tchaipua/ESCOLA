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
- SMTP da filial e opcional; quando informado, tem prioridade sobre o SMTP da empresa nos envios daquela filial. Quando vazio, o sistema usa o SMTP da empresa.
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

### `branchCode` em cadastros operacionais

- `branchCode = 1..n`: registro restrito a filial informada
- `branchCode = 0`: registro comum a todas as filiais
- quando a escola possui apenas uma filial, o backend ignora a filial enviada e grava na filial existente
- endpoints de professor, aluno, responsavel, serie, turma, serie x turma, disciplina, ano letivo, horarios base, vinculo professor x disciplina e grade horaria aceitam `branchCode` nas mutacoes

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
  "accountType": "user|teacher|student|guardian"
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
    "role": "PROFESSOR",
    "permissions": ["VIEW_DASHBOARD"]
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

Regras atuais:

- sincronizam dados compartilhados com `people`
- respeitam tenant e auditoria
- mantem campos especificos do papel

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

## Regras de payload importantes

- Campos textuais devem ser normalizados para uppercase, exceto senha
- CPF/CNPJ devem ser validados quando informados
- Nao pode haver violacao de tenant
- Nao existe delete fisico nos dados de negocio

## Caixa financeiro integrado

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
