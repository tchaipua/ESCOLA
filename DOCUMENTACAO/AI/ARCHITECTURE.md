# ARCHITECTURE

## Estado atual

O projeto esta organizado hoje como um monolito modular com dois blocos principais:

- `backend`: NestJS + Prisma
- `frontend`: Next.js App Router

A arquitetura continua preparada para evolucao futura, mas a entrega atual esta concentrada em uma base unica com foco em velocidade operacional, isolamento por tenant e regras de negocio auditaveis.

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

O modelo atual nao e "single-table puro". Ele e hibrido:

- `people` e o cadastro mestre por tenant
- `teachers`, `students` e `guardians` mantem dados operacionais e campos compartilhados sincronizados

A sincronizacao entre tabelas e controlada no backend pelo modulo `shared-profiles`:

- upsert do cadastro mestre (`people`)
- propagacao de campos compartilhados para papeis vinculados
- sincronizacao de credencial (senha) por email compartilhado

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

## Padrao de evolucao

A estrategia atual e:

1. manter o cadastro-base em `Person`
2. deixar papeis operacionais separados
3. sincronizar shared fields entre pessoa e papel
4. preservar historico, tenant e auditoria em todas as mutacoes
