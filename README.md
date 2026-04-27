# Escola - CODEX

 Projeto SaaS de gestao escolar com `backend` em NestJS/Prisma e `frontend` em Next.js.
 
 O ecossistema agora usa um `core financeiro` desacoplado em pasta propria:
 
- `C:\Sistemas\IA\Financeiro\backend`: API financeira multiempresa
- `C:\Sistemas\IA\Financeiro\frontend`: painel operacional do financeiro

## Onde fica a documentacao

- Documentacao oficial do projeto: `DOCUMENTACAO/AI`
- Diretrizes adicionais e materiais auxiliares: `DOCUMENTACAO`
- Regras para agentes de IA: `AGENTS.md`

## Estrutura principal

- `backend`: API escolar, regras de negocio, Prisma e integracoes
- `frontend`: aplicacao web Next.js da Escola
- `C:\Sistemas\IA\Financeiro\backend`: API financeira desacoplada consumida pela Escola
- `C:\Sistemas\IA\Financeiro\frontend`: painel web do core financeiro
- `DOCUMENTACAO`: referencia funcional, tecnica e instrucoes para IA

## Execucao local

- `npm run setup:ecossistema`: instala dependencias dos 4 projetos
- `npm run dev:ecossistema`: sobe Escola + Financeiro juntos
- `npm run build:ecossistema`: valida build dos 4 projetos

## Integracao visual atual

- a `Escola` continua sendo a interface principal do usuario
- o portal financeiro integrado abre em `/principal/financeiro`
- o `Financeiro` mora em `C:\Sistemas\IA\Financeiro`
- o `financeiro-frontend` roda sem autenticacao propria e recebe contexto da escola logada por URL

## Fluxo recomendado

Antes de implementar qualquer mudanca, leia `AGENTS.md` e a sequencia obrigatoria em `DOCUMENTACAO/AI`.
