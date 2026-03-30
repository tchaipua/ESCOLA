# API_SPEC

## Convencoes gerais

- Base URL: `/api/v1`
- Formato: JSON
- Autenticacao: `Authorization: Bearer <access_token>`
- Tenant: derivado do token e validado no backend
- Soft delete: cancelamento logico, nao remocao fisica, exceto no endpoint master exclusivo de purge definitivo de tenant
- Textos em uppercase, exceto senha

## Tenants

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

### POST `/auth/forgot-password`

- aceita `email`
- pode retornar `MULTIPLE_TENANTS` quando o email estiver em mais de uma escola

### POST `/auth/reset-password`

- redefine a senha por token
- respeita tenant e trilha de auditoria

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

Body resumido:

```json
{
  "name": "NOME",
  "cpf": "000.000.000-00",
  "email": "LOGIN@ESCOLA.COM",
  "password": "SenhaInicial",
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
