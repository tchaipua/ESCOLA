# PROMPTS

## Como usar

Substitua os blocos `<...>` e use o prompt correspondente ao tipo de entrega.
Sempre anexar junto: `SYSTEM_IDENTITY.md`, `PROJECT_CONTEXT.md`, `CODING_RULES.md`.

## 1) Gerar modulo backend completo

```text
Atue como engenheiro senior em NestJS + Prisma.
Gere o modulo <NOME_MODULO> com controller, service, dto, repository e testes.
Aplique obrigatoriamente:
- multi-tenant por schoolId
- soft delete por canceledAt
- auditoria completa
- textos em uppercase (exceto senha)
- validacao com class-validator
Use as regras dos arquivos de contexto anexados.
Entregue codigo pronto em arquivos separados.
```

## 2) Gerar schema Prisma de um dominio

```text
Com base no contexto anexado, gere o schema Prisma para <DOMINIO>.
Inclua:
- modelos
- relacionamentos
- indices
- unicidades
- enums
- campos de auditoria e soft delete
Nao remova schoolId de entidades de dominio.
```

## 3) Gerar endpoints REST

```text
Defina a especificacao REST para <DOMINIO>.
Inclua rotas CRUD logico, filtros, paginacao e codigos de erro.
A autenticacao e JWT e o tenant vem do token.
Mostre exemplos de request/response JSON.
```

## 4) Gerar tela Next.js (web admin)

```text
Gere uma tela Next.js App Router para <TELA>.
Use TypeScript + Tailwind + Axios.
Inclua:
- formulario com validacao
- tabela com busca/paginacao
- estados de loading/erro/sucesso
- controle de permissao por papel
Nao implementar logica fora do escopo da tela.
```

## 5) Gerar fluxo PWA offline

```text
Gere o fluxo PWA de <FUNCIONALIDADE> com estrategia offline-first.
Inclua:
- armazenamento local
- fila de sincronizacao idempotente
- resolucao de conflito
- feedback visual de sincronizacao
Contexto: professor/aluno em ambiente com internet intermitente.
```

## 6) Gerar regras financeiras com testes

```text
Implemente a regra de <REGRA_FINANCEIRA>.
Inclua testes unitarios cobrindo:
- caso normal
- atraso com juros
- atraso dentro da carencia
- aplicacao de desconto
- bloqueio por perfil sem permissao (nao CAIXA)
```

## 7) Revisao tecnica de codigo

```text
Revise o codigo abaixo com foco em:
- violacao de multi-tenant
- falhas de seguranca/auth
- ausencia de auditoria ou soft delete
- regressao funcional
- risco de performance
Retorne achados por severidade com sugestao objetiva de correcao.
```

## 8) Gerar plano de testes

```text
Monte o plano de testes para <MODULO>.
Separe em:
- testes unitarios
- testes de integracao
- testes E2E
Inclua criterios de aceite e massa de dados minima.
```

## 9) Gerar migracao incremental

```text
Proponha migracao incremental para adicionar <MUDANCA_SCHEMA>.
Inclua:
- estrategia sem downtime (quando possivel)
- script de backfill
- rollback
- impacto em indices e queries existentes
```

## 10) Quebrar requisito em tarefas executaveis

```text
Quebre o requisito <REQUISITO> em tarefas pequenas (1 a 4 horas cada).
Para cada tarefa, traga:
- objetivo
- arquivos impactados
- criterio de aceite
- dependencia
```
