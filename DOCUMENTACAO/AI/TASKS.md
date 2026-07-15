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
- [ ] Configurar Docker e Docker Compose (api, postgres, redis, nginx)
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

- 2026-07-14: Adicionado o card `Vendas 2` e a rota integrada `/principal/financeiro/vendas-2`, mantendo a regra operacional no sistema Financeiro separado.
- 2026-03-17: Resumo por turma agora ordena pelas séries conforme o `sortOrder` registrado no cadastro de séries para refletir a sequência natural de aprendizado.
- 2026-03-31: Regra oficializada de e-mail compartilhado entre escolas apenas para autenticacao (`login`, `forgot-password`, validacao de senha compartilhada e troca global de senha), mantendo isolamento normal por `tenantId` fora desses fluxos.
- 2026-05-17: Alerta residual de `npm audit` sobre Next/PostCSS pertence ao projeto `Financeiro`; a Escola apenas acompanha por consumir telas embutidas do Financeiro e nao requer alteracao tecnica local.
- 2026-06-23: Confirmado e documentado que o `Financeiro` e um sistema/repositorio separado em `C:\Sistemas\IA\Financeiro`, integrado com a `Escola` por API/contrato tecnico.
- 2026-06-23: `PRINCIPAL_GRADE` refatorada como cadastro de turmas com horario das aulas; todo lancamento da grade semanal fica obrigatoriamente vinculado a `seriesClassId`, e intervalos sao gravados em `class_schedule_items` com `teacherSubjectId = null`.
