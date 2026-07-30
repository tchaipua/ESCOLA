# Execução Docker de produção

Use exclusivamente `docker-compose.prod.yml`. Os arquivos `.vps` são legado de
desenvolvimento.

## Pré-requisitos

- Docker Engine com Compose v2;
- certificado e chave TLS válidos;
- sete arquivos de segredo fora do repositório:
  - URL PostgreSQL do runtime, com role sem owner e sem DDL;
  - URL PostgreSQL exclusiva do migrator, com permissão de migração;
  - JWT aleatório com pelo menos 32 bytes;
  - chave AES de exatamente 32 bytes em base64 canônico ou 64 caracteres
    hexadecimais;
  - chave técnica provisionada pelo MSINFOR Central.
  - chave HMAC exclusiva Escola → Financeiro;
  - chave HMAC exclusiva Financeiro → Escola.

Gere valores aleatórios sem reutilizar credenciais:

```bash
openssl rand -base64 48 > /caminho-seguro/escola_jwt
openssl rand -base64 32 > /caminho-seguro/escola_data_encryption_key
chmod 600 /caminho-seguro/escola_*
```

Não gere unilateralmente a chave do Central: use a credencial emitida e
registrada pelo próprio MSINFOR Central.

## Variáveis do Compose

Defina no host, sem versionar:

```text
TLS_CERT_FILE=/caminho-seguro/fullchain.pem
TLS_KEY_FILE=/caminho-seguro/privkey.pem
DATABASE_URL_SECRET_FILE=/caminho-seguro/escola_runtime_database_url
MIGRATION_DATABASE_URL_SECRET_FILE=/caminho-seguro/escola_migration_database_url
JWT_SECRET_FILE=/caminho-seguro/escola_jwt
DATA_ENCRYPTION_KEY_FILE=/caminho-seguro/escola_data_encryption_key
MSINFOR_CENTRAL_SYSTEM_KEY_FILE=/caminho-seguro/escola_central_system_key
FINANCEIRO_HMAC_ESCOLA_SECRET_FILE=/caminho-seguro/escola_financeiro_outbound_hmac
SOURCE_SYSTEM_ESCOLA_HMAC_SECRET_FILE=/caminho-seguro/escola_financeiro_callback_hmac
MSINFOR_CENTRAL_IDENTITY_ENABLED=true
MSINFOR_DATABASE_ALIAS=ESCOLA_PRIMARY
ESCOLA_DATABASE_RUNTIME_ROLE=escola_app
AUTH_SESSION_MAX_PER_ACCOUNT=10
TRUST_PROXY_HOPS=1
SCHOOL_PUBLIC_URL=https://escola.msinfor.com.br
PUBLIC_API_BASE_URL=/api/v1
MSINFOR_CENTRAL_FRONTEND_URL=https://central.msinfor.com.br
MSINFOR_CENTRAL_API_URL=https://central.msinfor.com.br/api/v1
FINANCEIRO_API_URL=https://financeiro-interno.msinfor.com.br/api/v1
ESCOLA_BACKEND_INTERNAL_URL=http://backend:3001
FINANCEIRO_FRONTEND_INTERNAL_URL=http://financeiro-frontend:3003
FINANCEIRO_FRONTEND_INTERNAL_BASE_PATH=/financeiro-app
```

Execute primeiro o target `migrator` com
`MIGRATION_DATABASE_URL_FILE` e somente após sucesso inicie o runtime com
`DATABASE_URL_FILE`. O migrator recusa segredos do runtime e o runtime recusa
qualquer credencial de migração. Antes de iniciar a API, o runtime compara
`current_user` com `ESCOLA_DATABASE_RUNTIME_ROLE` e falha se a role for owner,
superuser, tiver DDL ou privilégios de contorno.

Valide e só então suba:

```bash
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrator
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

## Vínculo de tenant central

O navegador e a URL pública não escolhem banco. Depois de cadastrar o tenant e
o acesso `ESCOLA` no MSINFOR Central, vincule o UUID global ao registro local
uma única vez pelo utilitário operacional:

```bash
node scripts/link-central-tenant.cjs \
  --local-tenant-id UUID_LOCAL \
  --central-tenant-id UUID_GLOBAL \
  --central-tenant-code CODIGO_GLOBAL \
  --database-alias ESCOLA_PRIMARY
```

O comando é idempotente, exige que o alias seja exatamente
`MSINFOR_DATABASE_ALIAS`, recusa vínculo divergente/duplicado e, em produção,
executa a mesma auditoria da role PostgreSQL de runtime. Ele nunca deve receber
credencial de migração.

Somente o gateway publica a porta `443`. Backend, frontend e Financeiro ficam
em redes internas. O serviço Financeiro opcional pode ser incluído com
`--profile integrated-financeiro`, mas continua sem porta pública.

Antes de cada atualização, faça backup externo dos volumes
`escola_data` e `escola_secret_backups`. A primeira inicialização com segredos
legados em texto puro cria um backup local criptografado antes de migrá-los.
