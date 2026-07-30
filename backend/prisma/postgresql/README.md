# PostgreSQL paralelo

Este diretório prepara a migração futura sem alterar a ponte SQLite usada nos
testes locais. O deploy atual continua lendo `backend/prisma/schema.prisma`.

## Validação e baseline

Defina `POSTGRES_DATABASE_URL` somente para validar o schema paralelo:

```bash
npm run prisma:postgres:validate
```

O baseline versionado em `migrations/00000000000000_baseline/migration.sql`
foi gerado por `prisma migrate diff` a partir do schema vazio. Este diretório
não é alcançado pelo `prisma migrate deploy` padrão.

## RLS — bloqueado para deploy automático

`manual-rls/001_tenant_isolation.sql` habilita e força RLS nas tabelas que
possuem `tenantId`. Ele só poderá ser executado depois que:

1. o MSINFOR Central emitir uma identidade de tenant verificável;
2. cada operação de banco ocorrer dentro de uma transação;
3. a transação executar `set_config('app.tenant_id', tenantId, true)` na mesma
   conexão;
4. o papel da aplicação não for owner e não possuir `BYPASSRLS`;
5. testes de isolamento e tentativa de cross-tenant estiverem aprovados.

Até lá, o SQL fica deliberadamente fora de qualquer pasta de migração
automática.

