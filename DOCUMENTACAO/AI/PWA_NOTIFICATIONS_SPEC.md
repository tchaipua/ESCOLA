# PWA_NOTIFICATIONS_SPEC

## Objetivo

Definir a especificacao funcional minima do PWA de `ALUNO` e `RESPONSAVEL` para consumo seguro das notificacoes geradas pelo backend, com foco inicial na chamada/presenca.

## Escopo inicial

Consumir notificacoes ja gravadas no backend para:

- chamada de aula
- provas e trabalhos
- recados do professor
- notas lancadas

Este documento prioriza o fluxo de chamada, porque ele exige isolamento rigoroso por vinculo.

## Fontes oficiais no backend

- `GET /api/v1/notifications/my`
- `GET /api/v1/notifications/my/unread-summary`
- `PATCH /api/v1/notifications/:id/read`
- `PATCH /api/v1/notifications/my/read-all`

Arquivos-base atuais:

- `backend/src/modules/notifications/infrastructure/controllers/notifications.controller.ts`
- `backend/src/modules/notifications/application/services/notifications.service.ts`

## Regra principal de isolamento

### Aluno

- enxerga apenas notificacoes onde:
  - `recipientType = STUDENT`
  - `recipientId = <id do aluno logado>`

### Responsavel

- enxerga apenas notificacoes onde:
  - `recipientType = GUARDIAN`
  - `recipientId = <id do responsavel logado>`

### Regra inegociavel

- o PWA nunca deve montar lista de notificacoes por turma
- o PWA nunca deve tentar juntar notificacoes de alunos diferentes
- o backend ja entrega o recorte correto por login; o frontend apenas consome e apresenta

## Categorias previstas

### `CHAMADA`

Uso:

- informar `PRESENTE` ou `FALTOU`
- mostrar observacao quando existir
- abrir a central de notificacoes do PWA

Campos relevantes em `metadata`:

- `lessonCalendarItemId`
- `schoolYearId`
- `seriesClassId`
- `studentId`
- `guardianId` quando destino for responsavel
- `status`
- `lessonDate`

### `AGENDA_ESCOLAR`

Uso:

- prova
- trabalho
- recado
- falta do professor

### `AVALIACAO`

Uso:

- nota lancada
- observacao da avaliacao

## Telas minimas do PWA

### 1. Inbox de notificacoes

Objetivo:

- listar notificacoes do usuario logado
- destacar nao lidas
- permitir abrir detalhe
- permitir marcar individualmente como lida
- permitir marcar tudo como lido

Campos visiveis por card:

- titulo
- mensagem resumida
- data/hora
- categoria
- status `NOVA` / `LIDA`

### 2. Detalhe da notificacao

Objetivo:

- mostrar a mensagem completa
- exibir contexto da aula quando existir
- marcar como lida ao abrir ou por acao explicita

Para notificacao de chamada, mostrar:

- data da aula
- horario
- disciplina
- serie/turma
- status: `PRESENTE` ou `FALTOU`
- observacao, se existir

### 3. Badge/resumo no topo

Objetivo:

- exibir total nao lido
- abrir inbox ao tocar

Fonte:

- `GET /notifications/my/unread-summary`

## Fluxo de chamada no PWA

### Aluno

Exemplo de leitura:

- titulo: `CHAMADA REGISTRADA: FALTOU`
- mensagem: informa disciplina, data, horario e professor
- detalhe: mostra se houve observacao

### Responsavel

Exemplo de leitura:

- titulo: `CHAMADA REGISTRADA: FALTOU`
- mensagem: precisa citar o nome do aluno
- detalhe: deve manter `studentId` no metadata para futura navegacao por aluno

## UX recomendada

- notificacoes mais recentes primeiro
- agrupamento visual por data
- destaque forte para `FALTOU`
- badge vermelha para nao lidas
- badge neutra para lidas
- detalhamento simples, sem excesso de campos tecnicos

## Offline-first

### Regras

- manter cache local das ultimas notificacoes baixadas
- permitir abertura offline do que ja foi sincronizado
- enfileirar `mark as read` localmente se estiver sem conexao
- reconciliar a fila no retorno da conectividade

### Chaves locais sugeridas

- `notifications:<recipientType>:<recipientId>`
- `notifications-unread-summary:<recipientType>:<recipientId>`
- `notification-read-queue:<recipientType>:<recipientId>`

## Contrato de sincronizacao

### Primeira carga

1. autenticar usuario
2. consultar `unread-summary`
3. consultar lista `my`
4. preencher inbox local

### Atualizacao incremental

1. reconsultar `unread-summary`
2. reconsultar `my`
3. substituir ou mesclar pelo `id`
4. manter ordenacao por `createdAt desc`

## Regras de seguranca no PWA

- nao confiar em filtro local para isolamento
- nao receber `recipientId` por parametro de tela
- sempre usar o token autenticado
- nao exibir metadata bruta para o usuario
- nao permitir busca por notificacoes de outro aluno

## Casos de teste recomendados para o PWA

- aluno visualiza apenas suas notificacoes
- responsavel visualiza apenas as notificacoes do proprio login
- responsavel com mais de um aluno vinculado recebe notificacoes separadas por aluno
- badge de nao lidas reduz apos marcar leitura
- notificacao de chamada exibe `PRESENTE` e `FALTOU` corretamente
- notificacao offline continua acessivel apos sincronizacao previa

## Dependencias futuras

- tela PWA de presenca historica do aluno
- deep link opcional para abrir a rotina/agenda correspondente
- push notification nativa do navegador, se adotada depois
