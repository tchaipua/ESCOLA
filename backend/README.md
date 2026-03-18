# Backend

API do sistema de gestao escolar em `NestJS` com `Prisma`.

## Referencias obrigatorias

- Documentacao central: `../DOCUMENTACAO/AI`
- Regras para agentes: `../AGENTS.md`

## Objetivo

Implementar regras de negocio preservando:

- multi-tenant por `schoolId`
- soft delete
- auditoria obrigatoria
- isolamento total entre escolas

## Comandos usuais

```bash
npm install
npm run start:dev
```
