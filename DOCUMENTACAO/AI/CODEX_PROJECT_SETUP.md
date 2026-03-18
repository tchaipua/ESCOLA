# CODEX_PROJECT_SETUP

## Estrutura recomendada no projeto real

```text
<repo-root>/
  AGENTS.md
  docs/
    ai/
      SYSTEM_IDENTITY.md
      PROJECT_CONTEXT.md
      ARCHITECTURE.md
      DATABASE.md
      API_SPEC.md
      CODING_RULES.md
      TASKS.md
      ROADMAP.md
      PROMPTS.md
      DECISIONS.md
      README.md
      HANDOFF_GEMINI_TO_CODEX.md
```

## Regra principal

- `AGENTS.md` fica na raiz do repositorio.
- Todo o restante da documentacao de IA fica em `docs/ai`.

## Ordem de leitura para IA

1. `docs/ai/SYSTEM_IDENTITY.md`
2. `docs/ai/PROJECT_CONTEXT.md`
3. `docs/ai/ARCHITECTURE.md`
4. `docs/ai/DATABASE.md`
5. `docs/ai/API_SPEC.md`
6. `docs/ai/CODING_RULES.md`
7. `docs/ai/DECISIONS.md`
8. `docs/ai/TASKS.md`
9. `docs/ai/ROADMAP.md`
10. `docs/ai/PROMPTS.md`

## Padrao para novos projetos

- Sempre manter esta pasta atualizada quando houver mudanca de regra de negocio.
- Qualquer decisao nova deve atualizar pelo menos:
  - `ARCHITECTURE.md` (se for tecnica)
  - `DATABASE.md` (se envolver dados)
  - `API_SPEC.md` (se envolver contrato)
  - `TASKS.md`/`ROADMAP.md` (se mudar prioridade)
  - `DECISIONS.md` (se mudar rumo tecnico)

## Quando migrar de Gemini para Codex

- Levar tambem `docs/ai/HANDOFF_GEMINI_TO_CODEX.md` preenchido.
- Informar branch atual e status de migracoes.
- Informar pendencias e bugs conhecidos.
