# ARCHITECTURE

## Estado atual

O ecossistema local possui dois sistemas/repositories integrados e separados:

- `C:\Sistemas\IA\Escola`: sistema escolar, painel academico/PWAs e integracao com financeiro
- `C:\Sistemas\IA\Financeiro`: sistema financeiro desacoplado, com backend e frontend proprios

Dentro do repositorio `Escola`, o projeto esta organizado hoje como um monolito modular com dois blocos principais:

- `backend`: NestJS + Prisma
- `frontend`: Next.js App Router

A arquitetura da `Escola` continua preparada para evolucao futura, mas a entrega atual esta concentrada em uma base unica com foco em velocidade operacional, isolamento por tenant e regras de negocio auditaveis.

O `Financeiro` nao deve ser tratado como apenas uma pasta interna da `Escola`. Ele e um projeto separado em `C:\Sistemas\IA\Financeiro`, com API propria e painel proprio. A `Escola` consome o `Financeiro` por integracao, mantendo a regra escolar de origem na `Escola` e a operacao financeira pesada no `Financeiro`.

O `MSINFOR_CENTRAL_IA` e a fonte oficial exclusiva dos dados cadastrais e das
configuracoes de empresa/filial. CNPJ, endereco, contatos, logotipo, S3, SMTP,
Telegram, recibos, parametros financeiros e comerciais sao consultados pela
Escola somente por API HMAC. O banco escolar conserva apenas o UUID global do
tenant, os codigos de filial necessarios ao isolamento operacional e os
vinculos de acesso. Indisponibilidade, resposta divergente ou configuracao
incompleta da Central falha fechada; nao existe fallback para colunas locais ou
variaveis de ambiente.

## Estrutura real do repositorio

- `backend/`
  - `src/common`: guards, decorators, tenant context, RBAC, interceptors
  - `src/modules`: modulos de negocio por dominio
  - `prisma/schema.prisma`: modelo de dados oficial
- `frontend/`
  - `src/app`: rotas do painel e login
  - `src/app/components`: componentes reutilizaveis do dashboard
  - `src/app/lib`: utilitarios de auth, RBAC, exportacao e formularios
- `DOCUMENTACAO/AI/`
  - base oficial de contexto, regras e handoff entre agentes

## Backend

### Estilo

- Monolito modular por dominio
- Regras de tenant centralizadas via contexto e middleware
- Soft delete obrigatorio nos dados de negocio
- Auditoria obrigatoria em mutacoes

### Modulos principais em uso

- `auth`
- `tenants`
- `people`
- `shared-profiles`
- `teachers`
- `students`
- `guardians`
- `subjects`
- `teacher-subjects`
- `series`, `classes`, `series-classes`
- `school-years`
- `enrollments`
- `class-schedule-items`
- `lesson-calendars`, `lesson-events`, `lesson-assessments`
- `notifications`
- `communications`
- `users`
- `global-settings`
- `integrations/msinfor-central`
- `user-preferences`

### Dados mestres de empresa e filial

- `Tenant.centralTenantId` vincula a escola local ao UUID global;
- `tenant_branches` funciona como projecao minima de `branchCode` e status para
  as chaves estrangeiras e o isolamento do dado academico;
- a lista, o nome, a marca e a configuracao efetiva de cada filial sao sempre
  obtidos da Central;
- a resolucao efetiva segue `BRANCH > TENANT > SYSTEM > GLOBAL`;
- somente o backend recebe segredos efetivos, e nunca os devolve ao navegador,
  ao log ou a auditoria;
- as rotas locais historicas de manutencao e o callback do Financeiro que
  gravava parametros na Escola respondem `410 Gone`.

## Modelo de identidade

### Pessoa mestre

A arquitetura passou a usar `Person` como cadastro-base compartilhado por escola (`tenantId`).

CPF ou CNPJ normalizado identifica uma única `Person` em todo o tenant. A filial
fica nos papéis operacionais; ela não cria outra identidade para a mesma pessoa.
E-mail não é chave de identidade, pois pode ser compartilhado.

`Person` concentra:

- nome e identificacao civil
- telefones e email
- endereco
- credencial compartilhada (`email` + `password`)
- trilha de auditoria

O acesso administrativo em `User` aponta para `Person` por `personId` e não
possui e-mail próprio. `email_credentials.email` permanece apenas como índice
técnico da credencial compartilhada. Cadastros sem CPF são permitidos e não são
mesclados automaticamente por nome ou e-mail.

### Papeis operacionais

As tabelas abaixo continuam existindo porque guardam comportamento e operacao especifica de cada papel:

- `Teacher`
- `Student`
- `Guardian`

Cada uma agora pode apontar para `personId`, reaproveitando o cadastro-base.

### Regra funcional principal

Uma mesma pessoa pode exercer mais de um papel na mesma escola.

Exemplos:

- professor e responsavel
- aluno e responsavel
- professor, responsavel e usuario administrativo em fluxos distintos

### Persistencia e sincronizacao de identidade

O modelo atual usa `people` como fonte unica dos dados comuns:

- `people` e o cadastro mestre por tenant
- `teachers`, `students` e `guardians` mantem somente dados operacionais do papel e `personId`

A vinculacao entre tabelas e controlada no backend pelo modulo `shared-profiles`:

- upsert do cadastro mestre (`people`)
- manutencao do `personId` nos papeis vinculados
- resolucao de nome, contato, endereco, Telegram e credencial pela pessoa central

Resultado:

- consistencia funcional entre papeis
- preservacao de historico e regras operacionais especificas por modulo

## Autenticacao e autorizacao

### Login

O login continua tenant-aware e role-aware:

- pode exigir escolha de escola (`MULTIPLE_TENANTS`)
- pode exigir escolha de como entrar (`MULTIPLE_ACCOUNTS`)
- usa o mesmo usuario e senha quando a pessoa compartilha credencial entre papeis

Em produção, a identidade é centralizada:

- a Escola envia a credencial somente por chamada backend a backend HMAC para
  `MSINFOR_CENTRAL_IA`; o navegador nunca escolhe banco, alias ou tenant local;
- a Central devolve o tenant global autorizado, a conta e o papel; a Escola
  aceita o resultado somente quando o alias corresponde exatamente a
  `MSINFOR_DATABASE_ALIAS` e existe vínculo local por `Tenant.centralTenantId`;
- papel central e papel local precisam coincidir; qualquer divergência falha
  fechada;
- a compatibilidade de senha local existe somente em desenvolvimento quando
  `MSINFOR_CENTRAL_IDENTITY_ENABLED=false` é definido explicitamente.

Cada login concluído cria uma linha em `auth_sessions` e um `jti` aleatório no
JWT mantido exclusivamente no cookie HttpOnly. O guard valida a sessão no banco
em todas as requisições e rejeita o transporte Bearer. Logout, troca de
senha, vínculo de identidade central, expiração e limite de sessões revogam a
sessão sem aguardar a expiração do token.

### RBAC

- perfis pre-definidos por papel
- permissoes explicitas quando necessario
- menus e telas filtrados no frontend e no backend

## Frontend

### Painel administrativo

O frontend agora trabalha com duas camadas para cadastros de pessoas:

- `dashboard/pessoas`: cadastro-base compartilhado e atribuicao de papeis
- `dashboard/professores`, `dashboard/alunos`, `dashboard/responsaveis`: operacoes especificas de cada papel

### Painel por papel

Quando a pessoa entra como `PROFESSOR`, `ALUNO` ou `RESPONSAVEL`, o dashboard mostra somente as funcoes daquele contexto.

Exemplos atuais:

- professor: calendario de aulas, agenda diaria, lancamento de notas
- aluno: turma, horario, dados proprios
- responsavel: alunos vinculados, horario, acompanhamento

## Persistencia

### Banco atual

- desenvolvimento local com SQLite via Prisma
- schema versionado em `backend/prisma/schema.prisma`
- client Prisma gerado a partir do schema atual
- schema PostgreSQL paralelo em `backend/prisma/postgresql/schema.prisma`
- baseline PostgreSQL isolado da cadeia de deploy atual
- RLS preparado em `backend/prisma/postgresql/manual-rls`, sem execucao automatica ate existir identidade Central e `set_config('app.tenant_id', ..., true)` na mesma transacao

### Regras obrigatorias

- `tenantId` em todas as entidades de negocio
- nenhum acesso cross-tenant
- nenhum delete fisico em negocio
- textos em uppercase, exceto senha

## Integracoes

- ViaCEP para preenchimento de endereco
- SMTP por tenant para recuperacao de senha e comunicacoes
- Financeiro separado em `C:\Sistemas\IA\Financeiro`

### Integracao com Financeiro

O `Financeiro` e o sistema oficial para titulos, parcelas, contas a pagar, caixa, produtos, estoque financeiro/fiscal e operacoes bancarias/fiscais.

Convencao local atual:

- backend do `Financeiro`: `localhost:3002`
- frontend do `Financeiro`: `localhost:3003`
- navegador acessa apenas a origem da Escola em `/financeiro-app` e `/api/financeiro`
- backend da Escola chama o Financeiro com HMAC-SHA-256 canônico `v1`, timestamp, nonce de uso único, hash do corpo e escopos assinados
- tenant, filial, usuário e autorização vêm exclusivamente da sessão validada; não são aceitos da URL do iframe

Responsabilidades:

- `Escola`: resolve regra academica, aluno, responsavel/pagador, mensalidade, filial e contexto do usuario
- `Financeiro`: persiste titulos, parcelas, caixa, baixas, produtos, contas a pagar, certificados e eventos financeiros

Configurações corporativas compartilhadas:

- parâmetros globais da softhouse pertencem ao projeto independente `C:\Sistemas\IA\MSINFOR_CENTRAL_IA` e são consumidos exclusivamente por API backend a backend;
- cada sistema usa `MSINFOR_CENTRAL_SYSTEM_ID` e uma chave HMAC técnica exclusiva, sem conexão direta com o banco central;
- os backends mantêm cache válido por 60 segundos e podem usar a última cópia por até 15 minutos quando a Central estiver temporariamente indisponível;
- S3, SMTP, Telegram e futuras integrações permanecem cadastrados na empresa/filial da Escola;
- configuração completa da filial tem prioridade; quando ausente, a Escola resolve o fallback da empresa;
- o resultado efetivo é enviado diretamente entre backends, autenticado pelo contrato HMAC canônico `v1`;
- senhas, tokens e credenciais nunca passam pelo frontend e são armazenados criptografados no Financeiro.
- empresa e filial são cadastradas somente na Escola; o Financeiro mantém um espelho sincronizado e não oferece inclusão manual;
- alterações permitidas de parâmetros no Financeiro retornam primeiro à Escola por `PATCH /integrations/financeiro/company-branch-parameters`, com chave HMAC direcional própria e proteção contra replay, e só depois atualizam o espelho financeiro;
- `FINANCEIRO_HMAC_ESCOLA_SECRET` autentica Escola → Financeiro e `SOURCE_SYSTEM_ESCOLA_HMAC_SECRET` autentica Financeiro → Escola; as chaves nunca podem ser iguais.

Regra obrigatoria: alteracoes financeiras operacionais devem ser avaliadas no repositorio `C:\Sistemas\IA\Financeiro`; a `Escola` deve manter apenas integracao, contexto e telas hospedeiras quando aplicavel.

## Padrao de evolucao

A estrategia atual e:

1. manter o cadastro-base em `Person`
2. deixar papeis operacionais separados
3. manter CPF, contato, e-mail, Telegram e endereco somente em `people`
4. preservar historico, tenant e auditoria em todas as mutacoes

## Barreira de seguranca de borda

- `Helmet` aplica cabecalhos HTTP de seguranca; a documentacao Swagger fica desabilitada por padrao em producao.
- CORS usa allowlist configurada por `CORS_ALLOWED_ORIGINS`/`FRONTEND_URL`; wildcard e origem HTTP fazem o startup falhar em producao.
- O navegador usa a mesma origem para `/api/v1`; requisições mutáveis autenticadas
  por cookie exigem `Origin` permitido, `Sec-Fetch-Site: same-origin` e o
  double-submit assinado `x-msinfor-csrf`.
- O throttling global protege a API e limites menores protegem login, recuperacao/confirmacao de senha e rotas administrativas legadas.
- O JWT existe somente dentro do cookie HttpOnly, nao possui fallback por
  `Authorization` e exige segredo com no minimo 32 bytes.
- O algoritmo master e sua compatibilidade local foram removidos; tokens e rotas legadas sao recusados. O usuário `MSINFOR` é autenticado exclusivamente pela API da Central, sem senha local e com empresa/filial autorizadas.
- A sanitizacao de resposta e feita em duas camadas: mapeamentos publicos nao carregam segredos e um interceptor remove campos sensiveis residuais de forma recursiva.
- Segredos SMTP, Telegram e S3 usam AES-256-GCM com IV aleatorio, tag de autenticacao e contexto por campo; adulteracao falha fechada.
- O startup migra texto puro de forma idempotente somente com chave valida e grava antes um backup local criptografado.

## Contêineres de producao

- `docker-compose.prod.yml` publica somente o gateway TLS.
- Backend, frontend e Financeiro comunicam-se por redes separadas; o Financeiro nao possui `ports`.
- Imagens usam build multi-stage e usuário sem privilégio.
- O target `migrator` contém a CLI Prisma e executa somente `migrate deploy` com a credencial owner; o runtime recebe o cliente PostgreSQL já gerado, inicia diretamente o Node e não executa migração ou `db push`.
- O migrator recebe exclusivamente `MIGRATION_DATABASE_URL_FILE`; o runtime
  recebe exclusivamente `DATABASE_URL_FILE` e recusa qualquer credencial de
  migração.
- Antes de iniciar, o runtime audita `current_user` contra
  `ESCOLA_DATABASE_RUNTIME_ROLE` e recusa owner, superuser, `CREATEDB`,
  `CREATEROLE`, `BYPASSRLS`, `REPLICATION` ou permissão de criação no banco e
  schema.
- `TRUST_PROXY_HOPS` é obrigatório em produção e deve representar exatamente a
  quantidade de proxies confiáveis entre o cliente e a aplicação.
- Containers usam filesystem somente leitura, `cap_drop: ALL`, `no-new-privileges`, `tmpfs` e healthchecks.
- `docker-compose.vps.yml` e os `Dockerfile.vps` foram preservados apenas como legado de desenvolvimento e nao podem ser usados em producao.
