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
- `user-preferences`

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
- autenticacao tecnica entre sistemas: `x-api-key`
- escopo financeiro resolvido por `sourceSystem`, `sourceTenantId` e, quando aplicavel, `sourceBranchCode`

Responsabilidades:

- `Escola`: resolve regra academica, aluno, responsavel/pagador, mensalidade, filial e contexto do usuario
- `Financeiro`: persiste titulos, parcelas, caixa, baixas, produtos, contas a pagar, certificados e eventos financeiros

Configurações corporativas compartilhadas:

- parâmetros globais da softhouse pertencem ao projeto independente `C:\Sistemas\IA\MSINFOR_CENTRAL_IA` e são consumidos exclusivamente por API backend a backend;
- cada sistema usa `MSINFOR_CENTRAL_SYSTEM_ID` e uma chave técnica exclusiva, sem conexão direta com o banco central;
- os backends mantêm cache válido por 60 segundos e podem usar a última cópia por até 15 minutos quando a Central estiver temporariamente indisponível;
- S3, SMTP, Telegram e futuras integrações permanecem cadastrados na empresa/filial da Escola;
- configuração completa da filial tem prioridade; quando ausente, a Escola resolve o fallback da empresa;
- o resultado efetivo é enviado diretamente entre backends, autenticado por `x-api-key`;
- senhas, tokens e credenciais nunca passam pelo frontend e são armazenados criptografados no Financeiro.
- empresa e filial são cadastradas somente na Escola; o Financeiro mantém um espelho sincronizado e não oferece inclusão manual;
- alterações permitidas de parâmetros no Financeiro retornam primeiro à Escola por `PATCH /integrations/financeiro/company-branch-parameters` e só depois atualizam o espelho financeiro;
- outros sistemas chamadores devem implementar o mesmo contrato de retorno, com URL e chave próprias por `sourceSystem`.

Regra obrigatoria: alteracoes financeiras operacionais devem ser avaliadas no repositorio `C:\Sistemas\IA\Financeiro`; a `Escola` deve manter apenas integracao, contexto e telas hospedeiras quando aplicavel.

## Padrao de evolucao

A estrategia atual e:

1. manter o cadastro-base em `Person`
2. deixar papeis operacionais separados
3. manter CPF, contato, e-mail, Telegram e endereco somente em `people`
4. preservar historico, tenant e auditoria em todas as mutacoes
