# HANDOFF_GEMINI_TO_CODEX

Preencha este arquivo quando for trazer um projeto iniciado no Gemini para continuidade no Codex.

## 1) Estado atual do projeto

- Repositorio: `C:\Sistemas\IA\Escola - CODEX`
- Branch atual: local de desenvolvimento
- Ultimo commit estavel: nao registrado neste arquivo
- Ambiente (dev/staging/prod): dev local
- Data do handoff: 2026-03-17

## 2) O que ja esta pronto

- Funcionalidades concluidas:
  - grids administrativas com configuracao de colunas, exportacao e popup de detalhes
  - exportacao institucional de Excel e PDF
  - acessos especiais com perfis complementares `FINANCEIRO` e `CAIXA`
  - configuracoes globais da softhouse (`S3` e `EMAIL`)
  - grade anual baseada na grade semanal
  - calendario expandido do professor
  - notificacoes internas e central de comunicacoes
  - lancamento de notas de provas e trabalhos
- Telas concluidas:
  - principais telas de dashboard escolar
  - `msinfor-admin`
  - `calendario-aulas`
  - `lancar-notas`
- Endpoints concluidos:
  - cadastros base da escola
  - configuracoes globais
  - notificacoes
  - comunicacoes
  - grade anual
  - eventos do calendario do professor
  - avaliacoes/notas do professor
- Integracoes concluidas:
  - configuracao global de `S3`
  - envio de email por configuracao da escola/softhouse, conforme contexto do modulo

## 3) O que falta fazer

- Backlog prioritario:
  - continuar refinando padroes e fluxos a partir de homologacao visual
  - ampliar cobertura automatizada
  - evoluir financeiro e PWA
- Pendencias tecnicas:
  - consolidar testes automatizados para regras sensiveis
  - continuar expandindo padroes compartilhados para telas auxiliares restantes
- Bugs conhecidos:
  - tratar conforme homologacao corrente; nao ha lista consolidada mantida aqui
- Debitos tecnicos:
  - parte da documentacao de roadmap/tasks ainda esta mais conceitual do que operacional

## 4) Banco de dados

- Status das migrations: schema atualizado via Prisma no ambiente local
- Ultima migration aplicada: nao controlada neste arquivo
- Mudancas de schema pendentes: verificar conforme proxima iteracao
- Seeds necessarios: nao documentados aqui

## 5) Infra e execucao

- Comandos para subir projeto:
  - backend: `npm run start:dev`
  - frontend: `npm run dev`
- Variaveis de ambiente obrigatorias: verificar `.env` do backend e frontend
- Servicos externos necessarios:
  - banco local configurado no projeto
  - email/S3 conforme configuracoes globais quando aplicavel
- URL local de cada app:
  - frontend: `http://localhost:3000`
  - backend: `http://localhost:3001`

## 6) Regras de negocio criticas

- Regras que NAO podem ser quebradas:
  - multi-tenant por `schoolId`
  - sem delete fisico em dados de negocio
  - auditoria em mutacoes
  - texto em uppercase, exceto campos sensiveis definidos
  - isolamento total entre escolas
- Validacoes obrigatorias:
  - RBAC por perfil/permissao
  - dados financeiros tratados como sensiveis
  - exportacao e grid respeitando configuracoes por usuario/tela
- Fluxos sensiveis:
  - financeiro
  - notificacoes/comunicacoes
  - acessos especiais
  - notas e calendario do professor

## 7) Testes

- O que esta coberto por testes:
  - validacao principal por build e verificacao funcional local
- O que ainda nao tem teste:
  - cobertura automatizada mais profunda para regras sensiveis
- Como rodar testes:
  - backend/frontend: `npm run build`
  - demais suites: verificar scripts do projeto

## 8) Prioridade da proxima iteracao

- Entrega 1: continuar refinando UX homologada e consolidar documentacao oficial
- Entrega 2: ampliar padroes compartilhados e testes sensiveis
- Entrega 3: evoluir financeiro e PWA com base nas regras ja definidas

## 9) Observacoes finais

- Riscos imediatos:
  - conversa longa pode perder contexto se a documentacao nao for mantida atualizada
- Decisoes pendentes:
  - continuam surgindo novos refinamentos de UI a cada homologacao
- Contexto adicional:
  - usar `UI_PATTERNS.md`, `UI_PATTERN_CHANGELOG.md` e este handoff como ponto de partida da proxima conversa

## 10) Handoff Codex (mar 18 2026)

- Sessao: Codex iniciada apos entrega do Gemini; esta rodada com comandos locais e subagente de exploracao.
- Contexto atual: workspace `C:\Sistemas\IA\Escola`, repositorio sem metadados `.git` (rodamos `git status -sb` e retornou \"not a git repository\"); confirmar onde fica o repositório rastreado ou se devemos inicializar.
- Passos imediatos: revisar DOCUMENTACAO/AI, mapear tarefas, manter multi-tenant/suporte de auditoria sem deletar fisico; registrar proximo estado no final desta iteracao.
