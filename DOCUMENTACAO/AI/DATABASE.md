# DATABASE

## Objetivo

Documentar o modelo atual de dados com foco nas regras obrigatorias do projeto.

## Regras globais obrigatorias

- Todo dado de negocio pertence a um `tenantId`
- Nao existe delete fisico em negocio
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

A credencial compartilhada hoje pode existir em:

- `users`
- `people`
- `teachers`
- `students`
- `guardians`

A regra aplicada e sincronizar senha por email quando o email representa o mesmo acesso funcional.

## Soft delete

Cancelamento logico continua obrigatorio.

- desativar papel nao remove a pessoa
- desativar pessoa nao deve apagar historico de papel
- relacoes historicas continuam preservadas

## Observacao sobre legado

O banco legado ja tinha `teachers`, `students` e `guardians` com campos repetidos. A transicao atual usa backfill para criar `people` e preencher `personId` sem apagar nada.
