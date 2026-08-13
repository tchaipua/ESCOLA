# TASKS

## Convencao

- [ ] pendente
- [~] em andamento
- [x] concluido

## Estado atual consolidado (2026-03-17)

- [x] Padrao oficial de grid com configuracao de colunas, exportacao e popup de detalhes consolidado
- [x] Exportacao institucional de Excel e PDF consolidada
- [x] Configuracoes globais da softhouse com abas de S3 e email
- [x] Acessos especiais da escola com perfis complementares `FINANCEIRO` e `CAIXA`
- [x] Grade anual derivada da grade semanal com periodos de aula e intervalo/ferias
- [x] Calendario expandido do professor com lancamento de prova, trabalho, recado e falta
- [x] Central de notificacoes web e central de comunicacoes com email/notificacao
- [x] Tela lateral de lancamento de notas de provas e trabalhos para o professor
- [x] Padrao de acoes de status nas grids principais (`ATIVAR` / `INATIVAR`) consolidado
- [x] Cadastro mestre de pessoas com `Person`, `personId` nos papeis e escolha de perfil no login
- [x] Central administrativa `dashboard/pessoas` criada para cadastro-base compartilhado
- [x] Backfill legado para popular `people` e vincular professores, alunos e responsaveis existentes
- [x] Escopo de filial em cadastros operacionais com transparencia para filial unica e opcao de cadastro comum para multiplas filiais
- [x] Selecao parcial de filiais em professores, alunos e responsaveis com impacto no login por papel
- [x] Gerenciamento de filiais no MSINFOR ADMIN a partir do grid de unidades ativas
- [~] Replicar continuamente novos padroes aprovados na documentacao oficial de UI

## Fase 0 - Fundacao tecnica

- [ ] Criar monorepo com apps API, web-admin, pwa-professor e pwa-aluno
- [ ] Configurar lint, format, tsconfig compartilhado e scripts padrao
- [~] Docker de producao seguro preparado; PostgreSQL permanece paralelo ate a migracao controlada
- [ ] Configurar CI minima (lint + testes)

## Fase 1 - Identidade, tenant e seguranca

- [x] Implementar auth JWT tenant-aware
- [x] Implementar RBAC com guard no backend
- [x] Implementar politica global de tenant por `tenantId`
- [~] Consolidar documentacao operacional equivalente a `VIEWUSUARIOS` no estado atual do login multi-conta
- [ ] Ampliar testes automatizados para fluxos de login com multiplas escolas e multiplos papeis
- [x] Criar o card `Dashboard` no `/dashboard` e a nova tela de métricas para destacar KPIs e links rápidos.

## Fase 2 - Cadastros base da escola

- [x] CRUD de serie (`SE`)
- [x] CRUD de turma (`TU`)
- [x] CRUD de serie x turma (`ST`)
- [x] CRUD de materia (`MA`)
- [x] CRUD de professor (`F-PR`) com perfil operacional
- [x] CRUD de responsavel (`F-RE`) com perfil operacional
- [x] CRUD de aluno (`F-AL`) com perfil operacional
- [x] CRUD de responsavel x aluno (`RA`) com parentesco
- [x] Cadastro-base compartilhado de pessoa e papeis na mesma escola
- [ ] Deep link da central de pessoas para abrir diretamente o registro operacional correspondente
- [x] Incluir a primeira opção da navegação como “Resumo geral”, reunindo pessoas e usuários e filtrando por papel direto na mesma tela.

## Fase 3 - Academico operacional

- [x] Grade anual e grade semanal sem conflito no fluxo atual
- [x] Comunicacoes e notificacoes operacionais
- [x] Painel por papel com menus restritos
- [ ] Tela explicita para marcacao de provas a partir da central do professor
- [ ] Cobrir com testes as regras de visibilidade por papel no dashboard

## Fase 4 - Professor

- [x] Calendario expandido
- [x] Agenda diaria
- [x] Lancamento de notas
- [ ] Expandir fluxo de avaliacao para planejamento e marcacao de provas com mais atalhos

## Fase 5 - Aluno/Responsavel

- [x] Consulta de horario por papel
- [x] Consulta dos alunos vinculados para responsavel
- [ ] Expandir transparencia de notas e frequencia em experiencias dedicadas

## Qualidade transversal

- [x] Normalizacao de uppercase em entradas textuais
- [x] Validacao de CPF e CNPJ nos formularios principais
- [x] Consulta de CEP via ViaCEP
- [x] Trilha de auditoria no modelo de negocio atual
- [ ] Cobrir regras criticas com testes automatizados, incluindo `Person` e selecao de perfil no login
- [x] Registrar a central de pessoas como tela de consulta somente leitura acessível a partir do dashboard principal.

## Notas recentes

- 2026-07-29: [x] Dados cadastrais e configuracoes de empresa/filial passaram a
  vir exclusivamente do MSINFOR Central por HMAC; projecao local reduzida a
  codigo/status auditados, rotas de mutacao legadas desativadas e fallback local
  removido de login, branding, comunicacoes, Telegram e Financeiro.
- 2026-07-29: [x] Bootstrap `creation-only` preparado com simulacao padrao para
  migrar dados legados sem sobrescrever a Central e sem registrar segredos.
- 2026-07-29: [x] Contrato Central de configuracao/filiais coberto por testes de
  assinatura, heranca `SYSTEM/GLOBAL`, isolamento e ausencia de segredos na
  resposta ao frontend.
- 2026-07-24: [x] Fase 2 de seguranca: algoritmo master e compatibilidade local removidos; rotas/tokens legados recusados e UI redirecionada ao Central sem credencial em URL/storage.
- 2026-07-24: [x] Segredos SMTP/Telegram/S3 cifrados em repouso por AES-256-GCM versionado, com migracao automatica idempotente, backup criptografado e testes de adulteracao.
- 2026-07-24: [x] Docker de producao multi-stage/non-root preparado com TLS, read-only, `cap_drop: ALL`, healthchecks, redes separadas e Financeiro sem porta publica.
- 2026-07-24: [x] Schema/baseline PostgreSQL paralelo e SQL RLS manual preparados; SQLite continua ponte local e RLS permanece fora do deploy automatico.
- 2026-07-24: [x] Homologacao E2E desacoplada de snapshot SQLite versionado; smokes atualizados para o modelo `Person` e Playwright aprovado em 5/5 cenarios sem alterar a UI.
- 2026-07-24: [x] Financeiro servido pela mesma origem em `/financeiro-app`, com BFF `/api/financeiro`, sessão HttpOnly, CSRF vinculado, HMAC direcional `v1`, callback antirreplay e quatro downloads fiscais limitados a 10 MiB.
- 2026-07-24: [x] Consumo técnico do MSINFOR Central convertido de chave bearer em cabeçalho para HMAC canônico `v1`, sem `x-msinfor-system-key`.
- 2026-07-24: [x] Imagem backend preparada com cliente PostgreSQL e target `migrator` separado; runtime não executa migração nem `db push`.
- 2026-07-24: [x] Login da Escola centralizado por HMAC no MSINFOR Central,
  com tenant global mapeado no servidor, alias/papel validados e fallback local
  restrito ao desenvolvimento explícito.
- 2026-07-24: [x] JWT vinculado a sessão revogável por `jti`, logout imediato,
  limite de sessões e revogação global após troca de senha ou vínculo central.
- 2026-07-24: [x] API da Escola publicada na mesma origem em `/api/v1`, com
  proteção CSRF global para mutações por cookie.
- 2026-07-24: [x] Sessão da Escola convertida para cookie HttpOnly exclusivo:
  login sem token no JSON, Bearer recusado, nenhum JWT no storage e CSRF
  obrigatório nas mutações autenticadas.
- 2026-08-11: [x] Preferências individuais de notificações por evento e canal
  implementadas na Escola, com disparos para inativações, cancelamentos e
  remoções de vínculos, mantendo tenant, soft delete e auditoria.
- 2026-08-11: [x] Histórico SQLite reconciliado: migration histórica ausente
  restaurada como marcador de compatibilidade e migration de preferências
  aplicada com `prisma migrate deploy`.
- 2026-08-13: [x] E-mail cadastral normalizado em `people`: removida a cópia de
  `users`, preservada apenas a chave técnica em `email_credentials` e mantido o
  cadastro sem CPF.
- 2026-07-24: [x] Runtime PostgreSQL protegido por credencial distinta do
  migrator e auditoria de role sem owner/superuser/DDL/BYPASSRLS.
- 2026-07-24: [ ] Concluir no MSINFOR Central identidade administrativa com MFA e sessao auditada; a Escola nao aceita mais master local.
- 2026-07-24: [ ] Em janela coordenada, higienizar o historico Git e rotacionar JWT, SMTP, Telegram, S3 e chaves tecnicas potencialmente expostas.
- 2026-07-23: Criado `C:\Sistemas\IA\MSINFOR_CENTRAL_IA` como fonte única das configurações globais da softhouse. Escola e Projeto Inicial usam fachadas backend, credenciais técnicas separadas, cache de 60 segundos com tolerância stale de 15 minutos, segredos criptografados e auditoria central.
- 2026-07-23: O `MSINFOR_CENTRAL_IA` recebeu painel por cards e o mostruário `CONFIGURA RECIBOS`, com categorias, imagem, JSON genérico, versões, download e auditoria.
- 2026-07-23: Ajustado o botão `CONFIGURAÇÕES GERAIS` da tela master da Escola para abrir o painel de cards do `MSINFOR_CENTRAL_IA`, com endereço configurável por ambiente.
- 2026-07-23: Implementado acesso administrativo integrado à Central: Escola e Projeto Inicial entram sem repetir senha por token temporário de uso único; o acesso direto valida a senha uma vez e mantém sessão central auditada.
- 2026-07-23: A central MSINFOR passou a hospedar `CONFIGURAÇÃO RECIBOS`, com o editor existente e a importação/exportação de pacotes por imagem, mantendo toda a regra, o tenant e a auditoria no Financeiro separado.
- 2026-07-19: Concluída a identidade única por CPF/CNPJ no tenant, sem duplicação por filial ou papel, com `personId` estável enviado ao Financeiro e consolidação lógica de registros legados.
- 2026-07-18: Adicionados os cards integrados `Emissão NF-e` e `Emissão NFS (Serviço)`, com rotas próprias, RBAC financeiro e emissão manual pertencente ao sistema Financeiro.
- 2026-07-14: Adicionado o card `Vendas 2` e a rota integrada `/principal/financeiro/vendas-2`, mantendo a regra operacional no sistema Financeiro separado.
- 2026-07-16: Concluída a sincronização antecipada dos alunos e responsáveis pagadores com o cadastro híbrido de clientes do Financeiro.
- 2026-03-17: Resumo por turma agora ordena pelas séries conforme o `sortOrder` registrado no cadastro de séries para refletir a sequência natural de aprendizado.
- 2026-03-31: Regra oficializada de e-mail compartilhado entre escolas apenas para autenticacao (`login`, `forgot-password`, validacao de senha compartilhada e troca global de senha), mantendo isolamento normal por `tenantId` fora desses fluxos.
- 2026-05-17: Alerta residual de `npm audit` sobre Next/PostCSS pertence ao projeto `Financeiro`; a Escola apenas acompanha por consumir telas embutidas do Financeiro e nao requer alteracao tecnica local.
- 2026-06-23: Confirmado e documentado que o `Financeiro` e um sistema/repositorio separado em `C:\Sistemas\IA\Financeiro`, integrado com a `Escola` por API/contrato tecnico.
- 2026-06-23: `PRINCIPAL_GRADE` refatorada como cadastro de turmas com horario das aulas; todo lancamento da grade semanal fica obrigatoriamente vinculado a `seriesClassId`, e intervalos sao gravados em `class_schedule_items` com `teacherSubjectId = null`.
