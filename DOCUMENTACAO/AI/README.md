# SaaS Gestao Escolar - Base de Projeto

Este repositorio contem apenas documentos de especificacao para iniciar um projeto futuro.
Nao ha implementacao de codigo neste momento.

## Objetivo

Definir um pacote de arquivos de contexto para IA gerar codigo com menos prompts repetitivos, mantendo:

- consistencia de arquitetura
- regras de negocio obrigatorias
- padrao tecnico da stack
- backlog claro por fases

## Stack obrigatoria

### Backend

- Node 20+
- TypeScript
- NestJS
- Prisma ORM
- PostgreSQL
- JWT + Refresh Token
- RBAC
- Redis (cache e fila futura)
- class-validator

### Frontend

- Next.js (App Router)
- React 18+
- TypeScript
- TailwindCSS
- Axios
- Context API ou Zustand
- PWA (professor, aluno e responsavel)

### Infra

- Docker
- Docker Compose
- Ubuntu Server
- Nginx (reverse proxy)
- SSL via Let's Encrypt

## Regras globais criticas

- Multi-tenant obrigatorio (`schoolId` em todas as tabelas de dominio)
- Nenhum dado pode ser excluido fisicamente: usar `canceledAt`
- Auditoria obrigatoria: `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `canceledAt`, `canceledBy`
- Toda query deve filtrar por `schoolId`
- Uma escola nunca pode acessar dados de outra
- Textos em UPPERCASE, exceto senha
- Senha e case-sensitive
- Login validado pela view `VIEWUSUARIOS`

## Mapa dos documentos

- `PROJECT_CONTEXT.md`: contexto de negocio, atores e modulos
- `ARCHITECTURE.md`: arquitetura tecnica recomendada
- `DATABASE.md`: padroes e modelo de dados
- `API_SPEC.md`: contratos REST iniciais
- `CODING_RULES.md`: regras de desenvolvimento
- `TASKS.md`: backlog detalhado
- `ROADMAP.md`: plano por fases
- `ACCESS_MATRIX.md`: matriz oficial de perfis e permissoes
- `UI_PATTERNS.md`: padroes oficiais de layout e comportamento aprovados
- `UI_PATTERN_CHANGELOG.md`: historico de evolucao dos padroes de UI
- `PWA_NOTIFICATIONS_SPEC.md`: especificacao funcional do PWA de aluno/responsavel para notificacoes
- `FINANCIAL_INTEGRATION.md`: diretriz para preparar o escolar para futura integracao com plataforma financeira externa
- `AGENTS.md`: instrucoes de agentes de IA para este projeto
- `PROMPTS.md`: prompts reutilizaveis
- `SYSTEM_IDENTITY.md`: identidade funcional do sistema

## Uso recomendado com IA

1. Compartilhar primeiro `SYSTEM_IDENTITY.md` e `PROJECT_CONTEXT.md`
2. Em seguida enviar `ARCHITECTURE.md` e `DATABASE.md`
3. Para gerar endpoints, anexar `API_SPEC.md`
4. Para qualidade e consistencia, anexar `CODING_RULES.md`
5. Para execucao orientada, anexar `TASKS.md` e `ROADMAP.md`

