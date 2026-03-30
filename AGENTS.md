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

## Preferencias do usuario desta base

- Responder sempre em portugues.
- Mostrar o minimo de detalhes possiveis sobre o que esta sendo feito, exceto quando isso for importante para o usuario.
- Tentar resolver tudo de forma autonoma, evitando pedir confirmacao quando houver caminho seguro e razoavel.
- Ao finalizar uma solicitacao, encerrar a resposta com `# ===> TERMINEI <===`.

## Regra de protecao para telas aprovadas

- Telas, componentes e fluxos visuais ja aprovados pelo usuario nao devem ser redesenhados, refatorados visualmente ou reorganizados sem solicitacao explicita.
- Em manutencoes de tela, alterar somente o problema pedido, preservando layout, espacamento, estrutura, componentes, textos, cores e comportamento ja aprovados.
- Antes de propor qualquer mudanca estrutural ou visual ampla, considerar isso bloqueado por padrao.
- Se a correcao exigir impacto visual inevitavel, aplicar a menor mudanca possivel e deixar claro o risco no retorno final.
- Regra soberana de UI: nenhum modelo, incluindo Codex, GPT-5.4, GPT-5.1, mini ou qualquer troca futura de agente, pode alterar layout aprovado sem permissao explicita do usuario no prompt atual.
- Em caso de duvida entre corrigir bug e mexer no visual, a prioridade obrigatoria e corrigir sem alterar layout.
- Ao receber pedido funcional em tela aprovada, assumir por padrao: manter a interface exatamente como esta e modificar apenas logica, dados, validacao ou elementos explicitamente solicitados.
- Esta regra deve ser preservada em qualquer handoff entre IAs e deve ser repetida como restricao ativa no inicio de nova sessao quando houver troca de modelo.
