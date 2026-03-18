# ROADMAP

## Estado atual resumido (2026-03-17)

Ja existe entrega funcional relevante em operacao local, incluindo:

- cadastros base da escola com grids padronizadas
- exportacao institucional de Excel/PDF
- acessos especiais da escola
- configuracoes globais da softhouse
- grade anual e grade horaria
- calendario do professor com eventos de aula
- notificacoes, comunicacoes e lancamento de notas
- cadastro mestre de pessoas com multiplos papeis no mesmo login
- escolha de perfil no login quando a mesma pessoa possui mais de um acesso

## Premissas

- Planejamento sem datas fixas de calendario
- Execucao por fases incrementais
- Cada fase entrega valor funcional e validavel
- Nenhuma fase pode violar tenant, soft delete ou auditoria

## Fase 1 - Consolidacao da identidade compartilhada

Objetivo: estabilizar o novo modelo `Person` em toda a operacao.

Entregas:

- central administrativa `dashboard/pessoas`
- sincronizacao entre `people` e papeis operacionais
- login multi-papel com escolha de perfil
- backfill dos registros legados

Pendencias recomendadas:

- testes automatizados dos fluxos de `MULTIPLE_ACCOUNTS`
- navegacao direta da pessoa para o registro operacional correto
- politicas de inativacao de papel a partir da visao mestre

## Fase 2 - Operacao academica por papel

Objetivo: deixar professor, aluno e responsavel enxergarem somente o que faz sentido para o papel escolhido.

Entregas atuais:

- professor com agenda, calendario e lancamento de notas
- aluno com horario e dados proprios
- responsavel com consulta dos alunos vinculados

Pendencias recomendadas:

- atalhos melhores para marcacao de provas
- visoes mais profundas de notas e frequencia para aluno/responsavel

## Fase 3 - Robustez de plataforma

Objetivo: reduzir risco operacional e aumentar confiabilidade.

Entregas desejadas:

- cobertura automatizada de regras sensiveis
- validacao dedicada de fluxos multi-tenant
- validacao dedicada de RBAC por papel e permissao
- pipeline minima de qualidade para build e testes

## Fase 4 - Financeiro e comunicacao ampliados

Objetivo: evoluir o modulo administrativo sem regredir o nucleo academico.

Entregas desejadas:

- amadurecer perfis complementares `FINANCEIRO` e `CAIXA`
- ampliar automacoes de comunicacao
- fortalecer relatorios e inadimplencia

## Criterios de prioridade para as proximas entregas

1. tudo que protege tenant, auditoria e consistencia de pessoa compartilhada
2. tudo que reduz duplicacao operacional de cadastro
3. tudo que melhora a experiencia por papel no login e no dashboard
4. tudo que amplia cobertura automatizada das regras sensiveis

## Riscos principais agora

- pontos restantes do legado ainda criarem expectativa de cadastro por papel em vez de cadastro-base
- falta de testes automatizados para o fluxo multi-papel
- necessidade futura de decidir como inativar papeis diretamente da visao mestre

## Mitigacoes atuais

- tela administrativa `Pessoas` como ponto central de cadastro
- avisos nas telas operacionais direcionando para a central
- sincronizacao de shared fields entre pessoa e papeis
- bloqueios extras para CPF duplicado dentro do mesmo papel

## Proxima consolidacao recomendada

- ampliar testes automatizados do backend para `Person`, `shared-profiles` e login multi-papel
- criar deep links entre `Pessoas` e modulos operacionais
- evoluir a UX do professor para marcacao de provas com o mesmo nivel ja entregue em notas e calendario
- estabilizar a nova tela de `Dashboard` e o acesso consolidado da central de pessoas para padronizar o cartão do painel principal.
- simplificar a tela `/dashboard/dashboard` para deixá-la como um bloco hero com logotipo e o texto “Central de gráficos e acompanhamentos”.
