# API_SPEC

## Convencoes gerais

- Base URL: `/api/v1`
- Formato: JSON
- Autenticacao: cookie de sessao `HttpOnly`, `SameSite=Strict` e `Secure` em producao
- Transporte proibido: JWT em `Authorization`, `localStorage`, `sessionStorage`, corpo ou URL
- Tenant: derivado da sessao validada no backend
- Filial: `branchCode` e derivado da sessao e pode ser informado em mutacoes de cadastros operacionais; `0` indica cadastro comum a todas as filiais
- Soft delete: cancelamento logico; a rota local historica de purge esta desativada
- Textos em uppercase, exceto senha

## Tenants

As rotas administrativas historicas de tenant que nao usam `/current` estao
desativadas e respondem `410 Gone`, independentemente de cabecalho, senha ou
ambiente. O onboarding e a administracao de softhouse devem partir do MSINFOR
Central quando o novo contrato autenticado estiver concluido.

### GET `/tenants/current/branches`

- Autenticacao: cookie de sessao HttpOnly da Escola
- Uso: lista filiais ativas recebidas da API do MSINFOR Central
- Regra: a Escola atualiza somente a projecao local minima de `branchCode` e status, com auditoria; nome, marca e demais dados retornados continuam pertencendo a Central
- Falha: indisponibilidade ou resposta divergente da Central interrompe a operacao, sem fallback local

### POST `/tenants/current/branches`

- Status: desativado (`410 Gone`)
- Uso: a manutencao de filial ocorre exclusivamente no MSINFOR Central

### GET `/tenants/current`

- Autenticacao: cookie de sessao HttpOnly da Escola
- Uso: retorna a identificacao e a marca efetivas da empresa/filial da sessao
- Fonte: contrato HMAC da Central, resolvido por `Tenant.centralTenantId`
- Segurança: nao retorna credenciais S3, senha SMTP ou token Telegram

### GET central `/api/v1/control-plane/technical/tenants/:tenantId/configuration`

- Acesso: HMAC tecnico `ESCOLA`; aceita `branchCode` opcional
- Uso: retorna empresa, filial e configuracao efetiva com prioridade `BRANCH > TENANT > SYSTEM > GLOBAL`
- Regra: UUID, filial, status e formato da resposta sao validados pela Escola; divergencia falha fechada

### GET central `/api/v1/control-plane/technical/tenants/:tenantId/branches`

- Acesso: HMAC tecnico `ESCOLA`
- Uso: lista as filiais ativas oficiais para login, selecao e isolamento local

### POST central `/api/v1/control-plane/technical/tenants/:tenantId/configuration/bootstrap`

- Uso exclusivo: migracao inicial, `creation-only`, com `branchCode` opcional
- Conflito (`409`) significa que o escopo ja possui configuracao e nunca deve ser sobrescrito
- O utilitario local roda em simulacao por padrao e usa `--apply` somente em janela coordenada; antes das configuracoes, chama a importacao protegida de filiais ausentes. Essa importacao e `create-only`, nao renomeia nem muda status existente, e o runtime nunca a chama. Payloads e segredos nunca sao registrados

### GET `/tenants/:id/branches`

- Status: legado desativado (`410 Gone`)
- Uso historico: listava filiais de uma escola a partir da tela local
- Regra: garante a existencia da primeira filial com `branchCode = 1`

### POST `/tenants/:id/branches`

- Status: legado desativado (`410 Gone`)
- Uso historico: criava filial pela administracao local
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
  - `storageDescription`
- Parametros de estoque aceitam `NO`, `YES` ou `BY_PRODUCT`:
  - `stockControlMode`
  - `stockIntegerQuantityMode`
  - `stockLotControlMode`
  - `stockExpirationControlMode`
  - `stockGridControlMode`
  - `stockNegativeControlMode`
- A classificação do estoque pertence à configuração comercial da Central e aceita `NONE`, `GROUP_ONLY` ou `GROUP_AND_SUBGROUP` em `stockClassificationMode`.

### PUT `/tenants/:id/branches/:branchId`

- Status: legado desativado (`410 Gone`)
- Uso historico: atualizava dados cadastrais e parametros da filial
- Restricao: `branchCode` nao pode repetir dentro da mesma escola

### GET `/tenants/:id/access-users`

- Status: legado desativado (`410 Gone`)
- Uso historico: listava usuarios administrativos e filiais liberadas
- Resposta inclui `branches`, `branchAccessCodes` e `branchAccesses`
- Regra: usuario com papel `ADMIN` deve ser interpretado como acesso a todas as filiais ativas, mesmo sem registros em `user_branch_accesses`

### POST `/tenants/:id/access-users`

- Status: legado desativado (`410 Gone`)
- Uso historico: criava usuario administrativo da escola
- Body aceita `name`, `email`, `password`, `role`, perfis/permissoes, `branchAccessCodes` e `cashierOnly`
- Regra: `branchAccessCodes` e obrigatorio para usuario nao-admin quando a escola possui mais de uma filial ativa
- Regra: para `role = ADMIN`, o backend ignora `branchAccessCodes` e libera todas as filiais
- Regra: `cashierOnly = true` em usuario nao-admin força o perfil complementar `CAIXA`; no login, o usuario cai direto em `PRINCIPAL_FINANCEIRO_VENDAS` e fica impedido de navegar pelo restante do painel

### PUT `/tenants/:id/access-users/:userId`

- Status: legado desativado (`410 Gone`)
- Uso historico: atualizava usuario administrativo e filiais liberadas
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

- Status: legado desativado (`410 Gone`)
- Uso historico: cancelava logicamente uma escola e suas dependencias
- Resultado: aplica `canceledAt` e `canceledBy`, preservando historico

### POST `/tenants/:id/purge`

- Status: legado desativado (`410 Gone`)
- Uso historico: excluia fisicamente uma escola e registros do `tenantId`
- Restricao futura: somente MSINFOR Central com identidade forte, MFA, auditoria e confirmacao reforcada
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

### Provisionamento técnico da identidade Central

- Cadastros operacionais com acesso (professor, aluno, responsável e usuário)
  sincronizam a identidade mínima pelo endpoint central
  `/identity/technical/synchronize`.
- O payload envia `externalSubjectId` estável no formato `PERSON:<personId>`
  ou `USER:<userId>`, além do UUID global da empresa e dos códigos das filiais
  autorizadas.
- A senha é enviada somente para criar a primeira identidade. Atualizações de
  perfil ou de filiais vinculam a conta existente e nunca substituem a senha
  global já gravada na Central.
- A mesma conta pode possuir vínculos em empresas diferentes, mantendo uma
  única credencial e isolamento operacional por tenant/filial.

### POST `/auth/login`

- Produção: a credencial é validada exclusivamente pelo MSINFOR Central por
  HMAC backend a backend em
  `/identity/technical/authenticate-and-resolve`.
- Descoberta: a primeira chamada não envia tenant. Em
  `MULTIPLE_TENANTS`, o `tenantId` escolhido pelo navegador é o UUID global
  devolvido pela Central, nunca o UUID ou alias do banco local.
- A resposta de `MULTIPLE_TENANTS` pode trazer `logoUrl` como URL pública
  somente leitura do logotipo da empresa cadastrada na Central; quando não
  houver logotipo, o campo permanece `null` e a interface usa as iniciais da
  empresa como fallback visual.
- Resolução local: o backend exige `databaseAlias = MSINFOR_DATABASE_ALIAS`,
  localiza `Tenant.centralTenantId` e exige coincidência exata entre papel
  central e papel local.
- Sessão: o sucesso cria `auth_sessions`, inclui um `jti` aleatório no JWT e
  grava o JWT exclusivamente em cookie `HttpOnly`, `SameSite=Strict` e
  `Secure` em produção. O JWT nunca integra o JSON da resposta.
- Desenvolvimento: senha local só é aceita quando
  `MSINFOR_CENTRAL_IDENTITY_ENABLED=false` estiver explicitamente definido.
- Restrição: depois da escolha da escola/perfil, todo acesso volta ao isolamento
  normal pelo `tenantId` local reconstruído no servidor.

Body atual:

```json
{
  "email": "USUARIO_OU_EMAIL",
  "password": "SENHA",
  "tenantId": "uuid-global-opcional-quando-ha-mais-de-uma-escola",
  "accountId": "opcional-quando-ha-mais-de-um-papel",
  "accountType": "user|teacher|student|guardian",
  "branchCode": "opcional-quando-ha-mais-de-uma-filial",
  "rememberMe": false
}
```

Respostas possiveis:

### Sucesso

```json
{
  "status": "SUCCESS",
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

Quando o usuário possui operação de caixa autorizada, a resposta de sucesso
também traz `cashSessionNotice` após a validação da empresa/filial. O campo
`openedAutomatically` diferencia a abertura feita no login de um caixa que já
estava aberto; `branchLogoUrl` é uma URL pública somente leitura resolvida pela
Central, e `cashierDisplayName` identifica o usuário responsável pela abertura.

```json
{
  "cashSessionNotice": {
    "openingAmount": 0,
    "openedAutomatically": true,
    "cashierDisplayName": "USUARIO",
    "branchLogoUrl": "https://central.example/logo-filial.png",
    "branchName": "FILIAL 1",
    "companyName": "ESCOLA"
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

- O campo `logoUrl` das filiais, quando existente, é devolvido como URL
  pública somente leitura da Central; a referência interna do armazenamento
  não é enviada diretamente ao navegador.

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

- Regra: usuarios `ADMIN` recebem todas as filiais ativas para escolha
- Regra: usuarios nao-admin recebem somente as filiais presentes em `user_branch_accesses`

### POST `/auth/logout`

- Autenticação: exclusivamente pelo cookie de sessão HttpOnly.
- CSRF: obrigatório com `Origin`, `Sec-Fetch-Site: same-origin` e
  `x-msinfor-csrf` vinculado ao cookie.
- Uso: grava `canceledAt` na `auth_sessions` correspondente ao `jti` atual e
  remove os cookies de autenticação e CSRF.
- Efeito: o JWT deixa de ser aceito imediatamente, mesmo antes de `exp`.

### Sessões revogáveis

- Toda requisição autenticada valida `jti`, tenant, usuário, tipo de conta,
  filial, expiração e cancelamento contra `auth_sessions`.
- `AUTH_SESSION_MAX_PER_ACCOUNT` limita sessões simultâneas; as mais antigas são
  canceladas ao exceder o limite.
- Troca de senha ou vínculo de identidade central revoga todas as sessões dos
  perfis que compartilham o e-mail.

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

- Produção com identidade central: recusado; recuperação de credencial pertence
  ao MSINFOR Central.
- Desenvolvimento com identidade central desabilitada explicitamente: aceita
  `email` e usa a credencial local compartilhada.

### POST `/auth/reset-password`

- Produção com identidade central: recusado; redefinição pertence ao MSINFOR
  Central.
- Desenvolvimento local explícito: redefine a credencial local por token e
  respeita a trilha de auditoria.

### POST `/auth/confirm-password`

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Autenticacao: cookie de sessao `HttpOnly` e token CSRF
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

- Autenticacao: cookie de sessao `HttpOnly` e token CSRF
- Body:

```json
{
  "currentPassword": "SENHA_ATUAL",
  "newPassword": "NOVA_SENHA"
}
```

- Produção com identidade central ou conta já vinculada: recusado; alteração de
  senha pertence ao MSINFOR Central.
- Desenvolvimento local explícito: altera a credencial compartilhada e revoga
  todas as sessões dos perfis ligados ao mesmo e-mail.

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

No cadastro de `/teachers`, `accessUsername` identifica o login PWA do professor;
o login antigo por e-mail continua compatível para registros sem esse campo.
`email` continua sendo o contato e o endereço de recuperação; quando
`accessUsername` for informado, o e-mail torna-se obrigatório e deve ser válido.
Sem `accessUsername`, o e-mail permanece opcional. A confirmação de senha é
validada no frontend e nunca é persistida.

## Anos letivos e feriados

### POST/PATCH `/school-years`

- Autenticacao: cookie de sessao `HttpOnly` e token CSRF
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

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Autenticacao: cookie de sessao HttpOnly da Escola
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Permissao: `VIEW_SCHOOL_YEARS`
- Uso: lista os feriados cadastrados para o ano letivo na escola/filial atual.
- Regra: a consulta respeita `tenantId`, mostra feriados comuns (`branchCode = 0`) e da filial atual, e ignora registros cancelados logicamente.

Query string:

```text
/school-years/holidays?year=2026
```

### PUT `/school-years/holidays`

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Regra: notificar por Telegram exige configuracao efetiva recebida do MSINFOR Central, alem de `telegramChatId` com opt-in ativo no aluno/responsavel.
- Regra: notificar por e-mail exige SMTP efetivo recebido do MSINFOR Central; nao existe fallback para colunas locais ou variaveis de ambiente. Quando enviado, a notificacao registra `emailedAt`.

### POST `/communications`

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Autenticacao: cookie de sessao HttpOnly da Escola
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

- Autenticacao: cookie de sessao HttpOnly da Escola
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Uso: configura no Telegram o webhook da escola logada usando o token efetivo fornecido somente ao backend pelo MSINFOR Central.
- Regra: a URL publica da API deve estar em `BACKEND_PUBLIC_URL`, `PUBLIC_API_URL` ou `API_PUBLIC_URL`; em ambiente local a URL gerada com `localhost` serve apenas para conferencia, pois o Telegram nao consegue chamar a maquina local.

### GET `/telegram/webhook-status`

- Autenticacao: cookie de sessao HttpOnly da Escola
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Uso: consulta no Telegram qual webhook esta configurado e quantas mensagens estao pendentes.

### POST `/telegram/poll-updates`

- Autenticacao: cookie de sessao HttpOnly da Escola
- Perfis: `ADMIN`, `SECRETARIA`, `COORDENACAO`
- Uso: busca manualmente somente as mensagens da escola presente na sessao via `getUpdates`.
- Regra: usado principalmente em ambiente local/testes, quando o Telegram nao consegue chamar um webhook em `localhost`.

### POST `/telegram/webhook/:tenantId`

- Rota publica chamada pelo Telegram.
- `tenantId`: escola que recebera a mensagem.
- Origem autenticada pelo header `X-Telegram-Bot-Api-Secret-Token`, comparado em tempo constante; o segredo nunca aparece na URL.
- Fluxo:
  - aceita somente conversa privada com `from.id` igual a `chat.id`;
  - `update_id` e deduplicado de forma persistente por escola;
  - um chat ainda nao vinculado recebe seu codigo tecnico e deve procurar a secretaria;
  - CPF/CNPJ, senha ou outro dado pessoal nunca cria vinculo pelo chat;
  - a secretaria valida a identidade por canal autenticado antes de gravar `telegramChatId`;
  - o mesmo Chat ID nao pode ser vinculado a duas pessoas da mesma escola;
  - pessoas ja vinculadas continuam consumindo os dados via `personId`;
  - se enviar `sair`, `parar`, `cancelar` ou `stop`, o bot registra opt-out.

## Regras de payload importantes

- Campos textuais devem ser normalizados para uppercase, exceto senha
- CPF/CNPJ devem ser validados quando informados
- Nao pode haver violacao de tenant
- Nao existe delete fisico nos dados de negocio

## Turmas

### POST/PATCH `/series-classes`

- Autenticacao: cookie de sessao HttpOnly da Escola
- Uso: cria/atualiza o vinculo serie x turma. Os campos SMTP antigos continuam
  aceitos apenas para preservar dados legados durante a transicao.
- Regra: nenhum envio consulta ou prioriza SMTP de `series_classes`; o SMTP de
  runtime vem exclusivamente da configuracao efetiva do MSINFOR Central.
- Regra: os dados SMTP legados nao sao apagados nem expostos por esta mudanca.

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

- Autenticacao: cookie de sessao HttpOnly da Escola
- Permissao: `VIEW_CASHIER`
- Uso: consulta o caixa aberto do usuario logado no `Financeiro`

### POST `/financial-cashier/open-session`

- Autenticacao: cookie de sessao HttpOnly da Escola
- Permissao: `VIEW_CASHIER`
- Uso: abre caixa para o usuario logado na escola atual

### POST `/financial-cashier/close-session`

- Autenticacao: cookie de sessao HttpOnly da Escola
- Permissao: `CLOSE_CASHIER`
- Uso: fecha o caixa aberto do usuario logado

### GET `/financial-cashier/installments`

- Autenticacao: cookie de sessao HttpOnly da Escola
- Permissao: `VIEW_CASHIER`
- Uso: lista parcelas do `Financeiro` para a escola atual
- Query string opcional:
  - `status`: `OPEN | PAID | OVERDUE | ALL`
  - `studentName`
  - `payerName`

### GET `/financial-cashier/open-installments`

- Autenticacao: cookie de sessao HttpOnly da Escola
- Permissao: `VIEW_CASHIER`
- Uso: alias legado para listar apenas parcelas em aberto no `Financeiro`

### POST `/financial-cashier/installments/:installmentId/settle-cash`

- Autenticacao: cookie de sessao HttpOnly da Escola
- Permissao: `SETTLE_RECEIVABLES`
- Uso: registra baixa em dinheiro no `Financeiro`
- Regra obrigatoria: o usuario precisa ter caixa aberto na escola atual

### POST `/student-financial-launches/sync-payers`

- Autenticacao: cookie de sessao HttpOnly da Escola
- Permissao: `VIEW_FINANCIAL`
- Uso: sincroniza no `Financeiro` todos os alunos ou responsáveis atualmente definidos como pagadores na filial
- Regra: o pagador aparece no cadastro de clientes do `Financeiro` mesmo sem título ou parcela
- Fonte oficial: dados de identidade e contato permanecem em `people` na Escola

### POST `/tenants/current/sync-financeiro-integration-settings`

- Autenticacao: cookie de sessao HttpOnly da Escola;
- Uso: sincroniza com o Financeiro somente a filial ativa da sessão validada, incluindo identidade, parâmetros financeiros/comerciais e configurações efetivas de S3, SMTP e Telegram;
- Regra: uma configuração completa da filial tem prioridade; caso contrário, é usada a configuração da empresa;
- Transporte: backend a backend com HMAC `v1`; somente esta rota recebe o escopo técnico isolado `SOURCE_SETTINGS_SYNC`;
- Segurança: senha SMTP, token Telegram e credenciais S3 nunca são retornados ao frontend nem registrados em log.

### PATCH `/integrations/financeiro/company-branch-parameters`

- Status: legado desativado (`410 Gone`), mesmo após autenticacao HMAC;
- Regra: o Financeiro nao altera mais parametros no banco da Escola; a fonte oficial e o MSINFOR Central.

### BFF same-origin `/api/financeiro/*`

- Sessão: cookie da Escola `HttpOnly`, `Secure` em produção e `SameSite=Strict`;
- Contexto: `GET /api/financeiro/context` é produzido pela Escola a partir da sessão revalidada;
- Mutações: exigem `Origin` permitido, `Sec-Fetch-Site: same-origin` e `x-msinfor-csrf` vinculado criptograficamente à sessão;
- Autorização: leitura recebe `FINANCE_ACCESS`; mutações allowlisted recebem `MANAGE_FINANCIAL`; somente `ADMIN`/`SOFTHOUSE_ADMIN` recebe `FINANCE_ADMIN`; rotas mutáveis desconhecidas falham fechadas;
- Downloads permitidos, com limite de 10 MiB: DANFE/XML de NF-e e DANFSe/XML de NFS-e;
- Proibido: encaminhar `Authorization`, cookies, `x-api-key`, autoridade de tenant/filial, papel ou permissões do navegador ao Financeiro.
- Para a identidade `MSINFOR_CENTRAL`, o contexto também carrega a decisão
  validada `canOperateCashier`; o BFF nunca aceita esse campo do navegador e
  assina sua projeção nos escopos HMAC consumidos pelo Financeiro.
- O BFF injeta o UUID global `centralTenantId` somente no tráfego backend a backend; após salvar empresa/filial na Central, o Financeiro atualiza imediatamente seu espelho e devolve qualquer falha à interface.

## Configuracoes globais MSINFOR Central

### GET/PUT `/global-settings`

- Status: fachada administrativa legada desativada (`410 Gone`).
- A administracao ocorre diretamente no `MSINFOR_CENTRAL_IA`; a Escola conserva apenas a leitura backend a backend de configuracao efetiva.

### POST `/global-settings/test-s3` e `/global-settings/test-email`

- Status: fachadas legadas desativadas (`410 Gone`).
- Testes administrativos devem ser iniciados no backend Central.

### GET central `/api/v1/global-settings/effective`

- Acesso técnico: HMAC canônico `v1` com system id, método, caminho/query RFC 3986, timestamp, nonce de 32 caracteres e SHA-256 do corpo exato.
- O cabeçalho legado `x-msinfor-system-key` não é enviado nem aceito.
- Uso: retorna a configuração efetiva completa somente ao backend consumidor.
- Prioridade preparada: `BRANCH > TENANT > SYSTEM > GLOBAL`.
- Falha: nao existe fallback local nem tolerancia a cache vencido.

## Autenticacao administrativa e respostas (2026-07-24)

### Rotas administrativas legadas da Escola

- O algoritmo deterministico e a compatibilidade de desenvolvimento foram removidos.
- Tokens master antigos e rotas administrativas locais são sempre recusados. `MSINFOR` é aceito apenas pela autenticação HMAC da Central, sem senha local e após seleção autorizada de empresa/filial.
- A UI redireciona ao MSINFOR Central com URL limpa, sem senha, token, query string ou hash.

### Respostas de tenant/filial/login

- Campos proibidos: `smtpPassword`, `telegramBotToken`, `storageProviderSecretAccessKey`, hashes de senha, tokens de verificacao/recuperacao e qualquer token de sessao.
- Indicadores permitidos: `hasSmtpPassword`, `hasTelegramBotToken` e `hasStorageProviderSecretAccessKey`.
- O login nunca devolve `access_token`, JWT ou outra credencial reutilizavel;
  apenas o cookie HttpOnly autentica chamadas posteriores.

### Limites de requisicao

- Login e confirmacoes de senha possuem limites especificos por janela.
- Recuperacao e redefinicao de senha possuem limites mais restritos.
- Rotas administrativas legadas falham antes de qualquer operacao de negocio.
- Quando excedido, o backend responde `429 Too Many Requests`.

## Preferências individuais de eventos de inativação e cancelamento

As preferências pertencem à Escola atual e são gravadas por `tenantId` e
`personId`. Cada pessoa possui sua própria matriz de eventos e canais.

### GET `/notification-settings/events`

- Autenticação: cookie de sessão HttpOnly da Escola;
- Permissão: `ADMIN`, `SECRETARIA` ou `COORDENACAO`;
- Uso: retorna o catálogo de eventos configuráveis e seus agrupamentos.

### GET `/notification-settings/users/:personId/preferences`

- Autenticação: cookie de sessão HttpOnly da Escola;
- Permissão: `ADMIN`, `SECRETARIA` ou `COORDENACAO`;
- Isolamento: a pessoa precisa pertencer ao `tenantId` da sessão;
- Uso: retorna a preferência salva ou o padrão desabilitado para cada evento.

### PATCH `/notification-settings/users/:personId/preferences`

- Autenticação: cookie de sessão HttpOnly da Escola;
- Permissão: `ADMIN`, `SECRETARIA` ou `COORDENACAO`;
- Corpo: lista de `eventType`, `enabled`, `sendInternal`, `sendEmail` e
  `sendTelegram`;
- Auditoria: toda alteração registra `createdBy`/`updatedBy` e nunca remove
  fisicamente a preferência;
- Uso: controla avisos de inativação, cancelamento e remoção de vínculos para
  a pessoa selecionada.

## Chat das notificações

Todas as rotas exigem a sessão HttpOnly da Escola e validam escola, filial,
notificação e participação na conversa.

- `GET /notifications/:id/chat`: retorna contexto, participantes e somente as mensagens visíveis ao usuário;
- `POST /notifications/:id/chat/messages`: inicia a dupla privada quando necessário e envia mensagem de até 2.000 caracteres;
- `GET /notifications/:id/chat/candidates?search=`: pesquisa pessoas ativas da mesma escola e filial;
- `POST /notifications/:id/chat/participants`: adiciona uma pessoa; apenas os dois participantes iniciais podem convidar;
- `POST /notifications/:id/chat/read`: atualiza a leitura do participante sem alterar a leitura dos demais.

Participantes convidados começam com `historyVisibleFrom` na hora do convite e
não recebem mensagens anteriores.

## Sincronização de acessos financeiros

`POST /financeiro/gateway/finance-access/source-sync` é uma operação local do BFF, permitida somente para `ADMIN`. A Escola consulta os usuários administrativos ativos do tenant, inclui suas filiais e referências `PERSON:<personId>` e envia a projeção sem senha ao Financeiro. Perfis e permissões financeiras não são gravados na tabela `users` da Escola.

### Callbacks de usuário do sistema

- `POST /integrations/financeiro/system-users/resolve`: consulta uma pessoa pelo CPF somente na escola autenticada e retorna seus dados e papéis existentes;
- `POST /integrations/financeiro/system-users/upsert`: reutiliza ou cria a `Person`, mantém a projeção técnica local necessária ao `VIEWUSUARIOS`, provisiona/vincula a identidade Central e devolve os identificadores ao Financeiro;
- Autorização: assinatura HMAC Financeiro → Escola com escopo único `SYSTEM_USERS_WRITE`, timestamp, nonce, hash do corpo, escola e filial vinculados;
- Regra: o cadastro operacional e os perfis de usuário do sistema são mantidos na tela do Financeiro. A projeção local não constitui uma segunda tela de cadastro e não armazena a senha recebida após o vínculo Central;
- Regra de identidade: CPF igual reutiliza a mesma pessoa, tanto quando o cadastro escolar nasceu primeiro quanto quando o usuário do sistema nasceu primeiro.
