# CODING_RULES

## Objetivo

Garantir consistencia tecnica na geracao de codigo por humanos e IA.

## Regras obrigatorias de negocio

- Toda entidade de dominio tem `schoolId`.
- Toda query filtra por `schoolId`.
- Nao existe delete fisico em dados de negocio, exceto no endpoint master exclusivo de purge definitivo de tenant.
- Auditoria obrigatoria em mutacoes.
- Texto em uppercase, exceto senha.
- Login via `VIEWUSUARIOS`.

## Backend (NestJS + TypeScript)

- Usar arquitetura modular por dominio.
- DTOs com `class-validator` e `class-transformer`.
- Nunca expor entidade Prisma diretamente no controller.
- Validar RBAC em guard dedicado.
- Centralizar erros com filtro global.
- Usar transacao para operacoes multi-tabela.
- Repositories devem aplicar tenant scope implicitamente.
- Purge fisico de tenant deve ficar isolado em fluxo master dedicado, com confirmacao reforcada e ordem explicita de exclusao por dependencia.

## Frontend (Next.js + TypeScript)

- App Router e componentes server/client conforme necessidade.
- Formularios com validacao de schema.
- Estado global leve (Context API ou Zustand).
- Axios com interceptors para token refresh.
- PWA com estrategia offline-first em modulo professor/aluno.

## Banco e Prisma

- Migrations obrigatorias e versionadas.
- Sem SQL ad-hoc em codigo de regra de negocio.
- Definir indices compostos com `school_id`.
- Implementar soft delete por campo `canceled_at`.
- Usar enums para papeis e status criticos.

## Seguranca

- Senhas com hash forte e salt.
- Nunca logar senha, token ou dados sensiveis brutos.
- Rate limit em login e recuperacao de senha.
- Sanitizacao de entradas textuais.
- Revalidacao de permissao no backend para toda operacao sensivel.

## Auditoria

Toda mutacao deve registrar:

- quem fez (`*_by`)
- quando fez (`*_at`)
- antes/depois quando necessario em log de auditoria

Excecao documentada:

- no purge fisico definitivo de tenant, o proprio historico do tenant e removido junto com os dados; nesse caso a protecao obrigatoria passa a ser confirmacao reforcada, rota exclusiva e uso restrito ao MSINFOR ADMIN master

## Padroes de codigo

- Nomes em ingles tecnico para codigo e banco.
- Funcoes pequenas e coesas.
- Evitar logica de negocio em controllers.
- Evitar duplicacao; extrair servicos reutilizaveis.
- Comentarios apenas quando a regra nao for obvia.

## Testes

- Unitario para regras de negocio criticas.
- Integracao para endpoints principais.
- Testes de autorizacao e isolamento multi-tenant.
- Testes de conflito de calendario (sala/professor).
- Testes de juros e baixa financeira.

## Definition of Done (DoD)

- Regras de negocio aplicadas
- Cobertura de testes minima nas regras criticas
- Auditoria e soft delete validados
- Sem violacao de tenant
- Documentacao de endpoint atualizada
