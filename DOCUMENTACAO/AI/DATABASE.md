# DATABASE

## Objetivo

Documentar o modelo atual de dados com foco nas regras obrigatorias do projeto.

## Regras globais obrigatorias

- Todo dado de negocio pertence a um `tenantId`
- Nao existe delete fisico em negocio, exceto no purge fisico definitivo de tenant acionado pelo MSINFOR ADMIN master
- Toda mutacao precisa de auditoria
- Textos ficam em uppercase, exceto senha
- Isolamento total entre escolas

## Colunas base obrigatorias

Padrao minimo para entidades de negocio:

- `id`
- `tenantId`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `canceledAt`
- `canceledBy`

## Cadastro mestre de pessoa

### `people`

Tabela mestre para identidade compartilhada por escola.

Campos principais:

- `name`
- `birthDate`
- `rg`
- `cpf`
- `cpfDigits`
- `cnpj`
- `nickname`
- `corporateName`
- `phone`
- `whatsapp`
- `cellphone1`
- `cellphone2`
- `email`
- `password`
- `resetPasswordToken`
- `resetPasswordExpires`
- `zipCode`
- `street`
- `number`
- `city`
- `state`
- `neighborhood`
- `complement`

### Regras de unicidade em `people`

Dentro do mesmo tenant:

- um `cpfDigits` identifica uma pessoa mestre
- um `email` identifica uma credencial compartilhada

Implementacao atual:

- `@@unique([tenantId, cpfDigits])`
- `@@unique([tenantId, email])`

## Papeis operacionais

As tabelas abaixo continuam armazenando campos e relacoes especificas de operacao:

- `teachers`
- `students`
- `guardians`

Cada uma possui `personId` opcional apontando para `people`.

## Regra funcional de modelagem

Uma pessoa pode ter varios papeis na mesma escola.

Exemplos validos:

- um professor tambem ser responsavel
- um responsavel tambem ser aluno
- um cadastro base alimentar mais de um papel sem repetir CPF, data de nascimento, endereco e credencial

## O que permanece especifico por papel

### `teachers`

- perfil de acesso do professor
- permissoes especificas
- disciplinas vinculadas
- valor por aula e historico de valores

### `students`

- matriculas
- turma/serie
- foto
- mensalidade
- observacoes academicas
- definicao de pagador (`billingPayerType` e `billingGuardianId`) para integracao com o `Financeiro`

### `guardians`

- vinculos com alunos
- parentesco
- descricao de parentesco quando necessario

## Sincronizacao entre pessoa e papeis

Campos compartilhados sao propagados entre `people` e os papeis vinculados:

- identificacao civil
- contato
- endereco
- credencial compartilhada

Objetivo:

- evitar divergencia entre cadastros repetidos
- permitir login unico com selecao de papel
- manter operacao especifica em cada modulo

## Login e senha

A credencial compartilhada agora deve ser controlada prioritariamente em:

- `email_credentials`

Campos principais:

- `email`
- `passwordHash`
- `emailVerified`
- `verifiedAt`
- `verificationToken`
- `verificationExpires`
- `resetPasswordToken`
- `resetPasswordExpires`

Legado ainda existente no banco:

- `users`
- `people`
- `teachers`
- `students`
- `guardians`

A regra aplicada agora e:

- a senha valida do ecossistema passa a ser a da tabela global por `email`
- a verificacao de e-mail passa a ser global por `email`
- os campos de senha legados deixam de ser o ponto oficial de controle

## Soft delete

Cancelamento logico continua obrigatorio.

- desativar papel nao remove a pessoa
- desativar pessoa nao deve apagar historico de papel
- relacoes historicas continuam preservadas

## Excecao de purge fisico de tenant

- O backend possui um fluxo master exclusivo para excluir fisicamente uma escola e todos os registros associados por `tenantId`
- Esse fluxo existe somente para administracao de softhouse e nao deve ser reutilizado em modulos operacionais
- O purge remove tambem os registros historicos daquele tenant e por isso exige confirmacao explicita do `tenantId`

## Observacao sobre legado

O banco legado ja tinha `teachers`, `students` e `guardians` com campos repetidos. A transicao atual usa backfill para criar `people` e preencher `personId` sem apagar nada.

## Financeiro operacional

Desde 2026-04-05, o banco da `Escola` nao mantem mais as tabelas operacionais de lotes e parcelas de mensalidade.

Regra oficial:

- `students` e `classes` continuam definindo valor e pagador
- titulos, parcelas e historico operacional de lancamentos ficam exclusivamente no projeto `Financeiro`
