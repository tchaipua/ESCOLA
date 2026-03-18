# API_SPEC

## Convencoes gerais

- Base URL: `/api/v1`
- Formato: JSON
- Autenticacao: `Authorization: Bearer <access_token>`
- Tenant: derivado do token e validado no backend
- Soft delete: cancelamento logico, nao remocao fisica
- Textos em uppercase, exceto senha

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

## Regras de payload importantes

- Campos textuais devem ser normalizados para uppercase, exceto senha
- CPF/CNPJ devem ser validados quando informados
- Nao pode haver violacao de tenant
- Nao existe delete fisico nos dados de negocio
