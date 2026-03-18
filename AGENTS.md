# AGENTS

## Objetivo

Padronizar como agentes de IA (Codex/Gemini) devem atuar neste projeto.

## Fonte oficial de documentacao

Toda a documentacao-base do projeto fica em `DOCUMENTACAO/AI`.

## Leitura obrigatoria antes de qualquer implementacao

1. `DOCUMENTACAO/AI/SYSTEM_IDENTITY.md`
2. `DOCUMENTACAO/AI/PROJECT_CONTEXT.md`
3. `DOCUMENTACAO/AI/ARCHITECTURE.md`
4. `DOCUMENTACAO/AI/DATABASE.md`
5. `DOCUMENTACAO/AI/API_SPEC.md`
6. `DOCUMENTACAO/AI/CODING_RULES.md`
7. `DOCUMENTACAO/AI/DECISIONS.md`
8. `DOCUMENTACAO/AI/TASKS.md`
9. `DOCUMENTACAO/AI/ROADMAP.md`

## Regras imutaveis

- Multi-tenant obrigatorio por `schoolId`.
- Nao existe delete fisico em dados de negocio.
- Auditoria obrigatoria em toda mutacao.
- Texto em uppercase, exceto senha.
- Login validado via `VIEWUSUARIOS`.
- Isolamento total entre escolas.

## Sequencia recomendada de agentes

1. Product/Business Analyst
2. Solution Architect
3. Backend + Frontend
4. QA/Test Engineer

## Contrato minimo de saida de qualquer agente

Toda entrega deve informar:

- contexto assumido
- regra de negocio aplicada
- arquivos afetados
- riscos/pontos pendentes

## Criterios de aceite tecnico

- Nenhuma violacao de tenant
- RBAC aplicado
- Soft delete respeitado
- Auditoria presente
- Testes para regras sensiveis

## Handoff entre IAs

Ao trocar de Gemini para Codex (ou vice-versa), preencher `DOCUMENTACAO/AI/HANDOFF_GEMINI_TO_CODEX.md` e anexar no primeiro prompt da nova sessao.
