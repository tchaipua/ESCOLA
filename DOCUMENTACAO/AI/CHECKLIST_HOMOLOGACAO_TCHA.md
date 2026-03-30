# CHECKLIST_HOMOLOGACAO_TCHA

## Objetivo

Garantir uma homologacao funcional e visual da escola `TCHA`, cobrindo web administrativo, PWA do professor, PWA do aluno e PWA do responsavel, sem violar tenant, RBAC, auditoria ou soft delete.

## Base oficial do cenario

- Escola: `TCHA`
- Ano letivo: `01/03/2026` ate `30/11/2026`
- Recesso: `01/07/2026` ate `31/07/2026`
- Massa base:
  - `100 alunos`
  - `200 responsaveis`
  - `2 responsaveis por aluno`
  - `10 materias`
  - `12 professores`
  - `3 series`
  - `5 turmas`

## Usuarios de homologacao

- Admin web: `ADMIN.TCHA@MSINFOR.COM` / `Admin001`
- Professor PWA: `PROF001.TCHA@MSINFOR.COM` / `Prof1234`
- Aluno PWA: `ALUNO001.TCHA@MSINFOR.COM` / `Aluno1234`
- Responsavel PWA: `RESP001.TCHA@MSINFOR.COM` / `Resp1234`

## Checklist web administrativo

- [ ] Login do admin redireciona para `/principal`
- [ ] Nome da escola `TCHA` aparece no painel
- [ ] Links principais carregam sem erro visual
- [ ] Cadastros base retornam dados sem erro de tenant
- [ ] Grade escolar carrega sem conflito de RBAC
- [ ] Calendario escolar exibe eventos do ano letivo

## Checklist PWA do professor

- [ ] Login do professor redireciona para `/professor`
- [ ] Painel mostra `PWA do professor`
- [ ] Agenda mensal sincroniza ao trocar a data
- [ ] Lista de aulas aparece para a data selecionada
- [ ] Chamada pode ser salva sem erro
- [ ] Marcacao de falta notifica aluno e responsavel
- [ ] Aba `notas` lista a prova marcada
- [ ] Lancamento de nota pode ser salvo sem erro
- [ ] Lancamento de nota notifica aluno e responsavel

## Checklist PWA do aluno

- [ ] Login do aluno redireciona para `/aluno`
- [ ] Painel mostra apenas o proprio nome e dados
- [ ] Notificacoes carregam sem dados de outro aluno
- [ ] Frequencia geral e por materia aparece
- [ ] Nota da prova marcada aparece com titulo correto
- [ ] Observacao da prova aparece no detalhe da nota
- [ ] Horario semanal carrega para a turma correta

## Checklist PWA do responsavel

- [ ] Login do responsavel redireciona para `/responsavel`
- [ ] Painel mostra apenas alunos vinculados
- [ ] Notificacoes mencionam somente o aluno correto
- [ ] Aba `alunos` nao exibe alunos de outro responsavel
- [ ] Media e frequencia do aluno vinculado aparecem
- [ ] Horarios carregam por aluno vinculado

## Checklist de regras sensiveis

- [ ] Nenhum endpoint retorna dados de outra escola
- [ ] Aluno nao consegue consultar outro aluno
- [ ] Responsavel nao consegue consultar aluno nao vinculado
- [ ] Auditoria existe nas mutacoes de chamada e nota
- [ ] Textos persistidos continuam em uppercase, exceto senha
- [ ] Nao houve delete fisico em dados de negocio

## Automacao recomendada

- Backend:
  - `npm run qa:tcha-smoke`
  - `npm run qa:tcha-grade-visibility`
  - `npm run test:attendance-notifications`
- Frontend:
  - `npm run test:e2e`

## Evidencias minimas

- Captura do painel `/principal`
- Captura da PWA do professor em `chamada`
- Captura da PWA do professor em `notas`
- Captura da PWA do aluno na aba `notas`
- Captura da PWA do responsavel na aba `alunos`
- Relatorio HTML do Playwright quando houver falha
