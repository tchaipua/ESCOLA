# CODING_RULES

## Objetivo

Garantir consistencia tecnica na geracao de codigo por humanos e IA.

## Regras obrigatorias de negocio

- Toda entidade de dominio tem `schoolId`.
- Toda query filtra por `schoolId`.
- Nao existe delete fisico em dados de negocio, exceto no endpoint master exclusivo de purge definitivo de tenant.
- Auditoria obrigatoria em mutacoes.
- Texto em uppercase, exceto senha.
- Login via `VIEWUSUARIOS`.

## Backend (NestJS + TypeScript)

- Usar arquitetura modular por dominio.
- DTOs com `class-validator` e `class-transformer`.
- Nunca expor entidade Prisma diretamente no controller.
- Validar RBAC em guard dedicado.
- Centralizar erros com filtro global.
- Usar transacao para operacoes multi-tabela.
- Repositories devem aplicar tenant scope implicitamente.
- Purge fisico de tenant deve ficar isolado em fluxo master dedicado, com confirmacao reforcada e ordem explicita de exclusao por dependencia.

## Frontend (Next.js + TypeScript)

- App Router e componentes server/client conforme necessidade.
- Formularios com validacao de schema.
- Estado global leve (Context API ou Zustand).
- Axios com interceptors para token refresh.
- PWA com estrategia offline-first em modulo professor/aluno.

### Padrao obrigatorio de identificacao e auditoria visual de telas

- Toda tela criada ou alterada deve manter no rodape o botao de copiar o nome tecnico da tela.
- Ao clicar no botao de copiar, alem de copiar o nome da tela, deve abrir um popup central de "Logica Usada nessa Tela".
- O popup deve seguir o padrao validado na tela `PRINCIPAL_FINANCEIRO_CAIXA_DETALHE`:
  - overlay escuro com blur e modal central moderno;
  - card principal branco, bordas arredondadas grandes e sombra forte;
  - cabecalho escuro em degradê, com `Auditoria SQL` como etiqueta e o identificador tecnico da tela logo abaixo;
  - botao de fechar circular no canto superior direito do cabecalho;
  - titulo central em formato de pill/etiqueta com `Logica Usada nessa Tela`;
  - origem da tela logo abaixo do titulo, centralizada, em vermelho, contendo sistema dono e path completo do arquivo;
  - area rolavel com estrutura, tabelas principais, relacionamentos, metricas/campos exibidos, filtros, ordenacao e SQL/base logica da consulta;
  - area do SQL em card branco com borda, sombra interna, fonte monoespacada e scroll proprio;
  - nomes fisicos das tabelas destacados em negrito e com fonte um pouco maior;
  - tabelas principais exibidas com alias entre parenteses e descricao em portugues, exemplo `cash_sessions (CS) - sessoes de caixa abertas/fechadas por operador.`;
  - botoes modernos `Copiar SQL` e `Fechar`, centralizados abaixo da area do SQL.
- Em telas embutidas do Financeiro, o rodape da Escola deve continuar sendo o ponto unico do botao de copiar/abrir auditoria, evitando duplicar o identificador dentro do iframe.
- Esse padrao deve ser considerado obrigatorio para novas telas da Escola, inclusive telas que consomem sistemas externos.

## Banco e Prisma

- Migrations obrigatorias e versionadas.
- Sem SQL ad-hoc em codigo de regra de negocio.
- Definir indices compostos com `school_id`.
- Implementar soft delete por campo `canceled_at`.
- Usar enums para papeis e status criticos.

## Seguranca

- Senhas com hash forte e salt.
- Nunca logar senha, token ou dados sensiveis brutos.
- Rate limit em login e recuperacao de senha.
- Sanitizacao de entradas textuais.
- Revalidacao de permissao no backend para toda operacao sensivel.

## Auditoria

Toda mutacao deve registrar:

- quem fez (`*_by`)
- quando fez (`*_at`)
- antes/depois quando necessario em log de auditoria

Excecao documentada:

- no purge fisico definitivo de tenant, o proprio historico do tenant e removido junto com os dados; nesse caso a protecao obrigatoria passa a ser confirmacao reforcada, rota exclusiva e uso restrito ao MSINFOR ADMIN master

## Padroes de codigo

- Nomes em ingles tecnico para codigo e banco.
- Funcoes pequenas e coesas.
- Evitar logica de negocio em controllers.
- Evitar duplicacao; extrair servicos reutilizaveis.
- Comentarios apenas quando a regra nao for obvia.

## Testes

- Unitario para regras de negocio criticas.
- Integracao para endpoints principais.
- Testes de autorizacao e isolamento multi-tenant.
- Testes de conflito de calendario (sala/professor).
- Testes de juros e baixa financeira.

## Definition of Done (DoD)

- Regras de negocio aplicadas
- Cobertura de testes minima nas regras criticas
- Auditoria e soft delete validados
- Sem violacao de tenant
- Documentacao de endpoint atualizada
