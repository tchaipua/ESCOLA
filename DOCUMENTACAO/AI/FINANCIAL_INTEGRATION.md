# FINANCIAL_INTEGRATION

## Objetivo

Registrar a preparacao do sistema escolar para futura integracao com uma plataforma financeira separada e reutilizavel entre varios ramos de negocio.

Este documento nao cria o modulo financeiro dentro do sistema escolar. Ele define apenas como o escolar deve guardar e expor a regra de `quem paga a mensalidade` para que, futuramente, um sistema financeiro externo possa emitir contas a receber, boleto e Pix com o pagador correto.

## Contexto atual do sistema escolar

O estado atual da base aponta para o seguinte:

- `students` ja concentra a mensalidade em `monthlyFee`
- `guardian_students` hoje representa somente o vinculo aluno x responsavel e o parentesco
- `people` funciona como cadastro mestre por tenant e ajuda na futura identificacao civil do pagador

Conclusao:

- a regra de pagador da mensalidade deve ficar vinculada ao aluno
- a tabela `guardian_students` deve continuar focada em relacionamento e parentesco

## Decisao funcional

Para o momento atual do produto, a definicao de quem paga a mensalidade deve ser armazenada no cadastro do aluno.

Campos recomendados em `students`:

- `billingPayerType`: `ALUNO` ou `RESPONSAVEL`
- `billingGuardianId`: nullable, preenchido apenas quando o pagador for um responsavel
- `billingDueDay`: nullable, opcional para futura integracao financeira

Regra principal:

- a mensalidade continua pertencendo ao aluno
- o pagador pode ser o proprio aluno ou um responsavel vinculado
- se o pagador for um responsavel, ele deve estar previamente cadastrado e vinculado ao aluno

## O que nao deve ser feito agora

- nao criar contrato escolar completo apenas para definir o pagador
- nao mover contas a receber para dentro do sistema escolar
- nao salvar regra financeira principal na tabela `guardian_students`
- nao depender de `studentId` como identificador universal do pagador

## Fluxo recomendado na tela de aluno

Manter a UX dentro do modulo de aluno, aproveitando a aba de responsaveis ja existente.

Fluxo sugerido:

1. O usuario vincula um ou mais responsaveis ao aluno.
2. Na mesma area do aluno, o sistema exibe a pergunta `Quem paga a mensalidade?`
3. Opcoes:
   - `O proprio aluno`
   - `Um responsavel`
4. Se o usuario escolher `Um responsavel`, o sistema abre um seletor apenas com os responsaveis ativos ja vinculados a esse aluno.
5. O sistema salva a regra no proprio aluno.

Comportamento esperado:

- se `billingPayerType = ALUNO`, entao `billingGuardianId = null`
- se `billingPayerType = RESPONSAVEL`, entao `billingGuardianId` deve apontar para um responsavel valido vinculado ao aluno

## Validacoes obrigatorias

- nao permitir `billingPayerType = RESPONSAVEL` sem `billingGuardianId`
- nao permitir selecionar um responsavel que nao esteja em `guardian_students`
- nao permitir selecionar responsavel inativo como pagador
- ao remover o vinculo de um responsavel que hoje esta definido como pagador, bloquear a exclusao ou exigir troca previa do pagador
- se o financeiro futuro exigir boleto ou Pix, o pagador escolhido deve possuir os dados minimos necessarios, como `nome` e `cpf/cnpj`

## Contrato futuro com a plataforma financeira

O sistema escolar deve informar ao financeiro tres camadas diferentes:

1. Origem da cobranca
2. Referente a quem
3. Quem vai pagar

Exemplo sem acoplamento indevido:

- `sistemaOrigem = ESCOLA`
- `referenteATipo = ALUNO`
- `referenteAId = <studentId>`
- `pagadorTipo = ALUNO | RESPONSAVEL`
- `pagadorId = <studentId ou guardianId>`
- `pagadorPersonId = <personId quando existir>`

O `studentId` nao identifica o pagador universalmente. Ele identifica o aluno ao qual a cobranca pertence.

## Exemplo de payload futuro da escola para o financeiro

```json
{
  "tenantId": "TENANT_001",
  "sistemaOrigem": "ESCOLA",
  "referenteATipo": "ALUNO",
  "referenteAId": "student_123",
  "pagadorTipo": "RESPONSAVEL",
  "pagadorId": "guardian_456",
  "pagadorPersonId": "person_900",
  "pagadorNome": "MARIA SILVA",
  "pagadorCpfCnpj": "12345678900",
  "valor": 850.0,
  "vencimento": "2026-05-10"
}
```

## Responsabilidade do sistema financeiro futuro

Quando a integracao existir, o financeiro devera:

- manter sua propria tabela de pessoas financeiras
- receber o pagador resolvido pelo escolar
- gravar snapshot do nome e documento do pagador no titulo financeiro

Motivo:

- se o cadastro do aluno ou responsavel mudar depois, o boleto e a conta gerada no passado continuam com o historico correto

## Estrategia incremental recomendada

Fase 1:

- adicionar os campos de pagador ao aluno
- expor esses campos na API e na tela de aluno
- validar o vinculo com responsavel ja cadastrado

Fase 2:

- criar endpoint ou payload de integracao da escola para a futura plataforma financeira

Fase 3:

- gerar contas a receber, boleto e Pix no sistema financeiro externo

## Prompt recomendado

O prompt oficial para implementar esta mudanca de forma segura foi registrado em `PROMPTS.md`.
