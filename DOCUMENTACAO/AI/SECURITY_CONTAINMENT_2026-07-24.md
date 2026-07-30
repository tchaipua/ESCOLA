# SECURITY_CONTAINMENT_2026-07-24

## Objetivo

Conter riscos P0/P1 e concluir a Fase 2 de endurecimento da Escola.

## Controles aplicados

- algoritmo master, flag de compatibilidade, sessao local e scripts auxiliares removidos;
- tokens master antigos e rotas administrativas locais falham fechados em qualquer ambiente; `MSINFOR` é aceito exclusivamente pela API da Central, sem senha local e com empresa/filial autorizadas;
- `/msinfor-admin` e o logotipo redirecionam ao Central por URL limpa, sem token, senha, query string ou hash;
- startup recusa JWT, chave AES, banco, URLs HTTPS ou credencial tecnica Central ausentes/inseguros em producao;
- Helmet, CORS allowlist e throttling global/especifico;
- segredos removidos de mapeamentos e respostas recursivamente;
- flags `hasSmtpPassword`, `hasTelegramBotToken` e `hasStorageProviderSecretAccessKey`;
- bancos, backups, logs, SQLite e scripts temporarios excluidos do worktree e ignorados pelo Git/Docker;
- preparacao E2E recriada a partir do schema Prisma em banco temporario ignorado, sem snapshot versionado;
- dependencias backend/frontend atualizadas ate `npm audit` zerar.
- segredos SMTP, Telegram e S3 cifrados por AES-256-GCM versionado, com AAD por campo e deteccao de adulteracao;
- migracao automatica idempotente com backup local criptografado antes da primeira escrita;
- imagens Docker de producao multi-stage/non-root e compose TLS/read-only/capabilities removidas/redes segmentadas;
- schema/baseline PostgreSQL paralelo e RLS manual fora do deploy automatico.
- webhook do Telegram autenticado por header com HMAC e comparacao em tempo
  constante, sem segredo na URL;
- vinculo automatico por CPF/CNPJ removido; chats novos exigem validacao
  administrativa e logs de debug/polling ficam desabilitados em producao.
- apenas chats privados sao aceitos; Chat ID e unico por escola e repeticao/
  estado curto do Telegram ficam persistidos no banco para suportar replicas.
- JWT de sessão transportado exclusivamente por cookie HttpOnly; resposta de
  login, `localStorage` e `sessionStorage` não recebem token reutilizável;
- Bearer recusado pela estratégia e pelo middleware de tenant; mutações
  autenticadas não possuem exceção de CSRF por tipo de transporte;
- frontend sem montagem de `Authorization`, com bloqueio global adicional
  contra cabeçalho residual e acesso ao Financeiro somente pela mesma origem.

## Validacao executada

- build backend e frontend, incluindo o artefato Next standalone usado no container;
- 14 testes de contencao e 32 testes de negocio/legado;
- suites `change-shared-password` (11/11) e `class-schedule-overlap` (5/5);
- smokes TCHA em banco temporario limpo, sem credencial master;
- Playwright no artefato standalone: 5 de 5 cenarios aprovados;
- teste estático cookie-only em 86 arquivos frontend, incluindo as 38 rotas
  geradas, e testes de recusa de Bearer/cookie HttpOnly/CSRF no backend;
- `npm audit` completo e `npm audit --omit=dev`: zero vulnerabilidades no backend e frontend;
- schema PostgreSQL validado e baseline conferido byte a byte com o diff atual;
- Compose/Dockerfiles aprovados por validacao estatica de YAML, redes, portas, usuario e controles de privilegio.

## Acao operacional ainda obrigatoria

A exclusao atual nao remove dados de commits anteriores. Em janela coordenada e com aprovacao explicita:

1. gerar inventario de exposicao sem imprimir valores;
2. suspender deploys e combinar o rewrite com todos os colaboradores;
3. higienizar o historico Git e invalidar clones antigos;
4. rotacionar JWT, SMTP, Telegram, S3, chaves de integracao e demais credenciais potencialmente presentes em banco/log;
5. redeployar por secret manager e confirmar que tokens anteriores foram revogados;
6. executar busca de segredos e auditoria de logs depois da rotacao.

Nao executar `force push` ou rewrite automaticamente.

## Pendencias arquiteturais

- concluir autenticacao administrativa Central com MFA e sessao auditada;
- armazenar chaves de runtime em secret manager e executar a rotacao coordenada;
- construir/subir as imagens e executar `nginx -t` em host com Docker/Nginx
  instalados; ambos nao estao disponiveis nesta estacao;
- validar PostgreSQL e RLS com papel sem `BYPASSRLS`, contexto transacional e testes cross-tenant/cross-branch antes de ativar;
- manter o compose/Dockerfiles `.vps` restritos ao desenvolvimento.
