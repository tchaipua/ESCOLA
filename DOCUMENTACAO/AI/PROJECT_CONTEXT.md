# PROJECT_CONTEXT

## Visao geral

Plataforma SaaS de gestao escolar multi-tenant com 5 frentes:

1. Gerenciamento da softhouse (cadastro e administracao de escolas)
2. Gerenciamento operacional da escola (cadastros academicos e agenda)
3. PWA do professor (chamada, provas, notas, notificacoes)
4. PWA do aluno/responsavel (rotina escolar, notas, presenca, avisos)
5. Gerenciamento financeiro (contas a receber, boletos, baixa e cobranca)

## Atores do sistema

- `SOFTHOUSE_ADMIN`: opera cadastro macro de escolas
- `ESCOLA_ADMIN`: administra dados da propria escola
- `USUARIO_ESCOLA`: gerente, coordenadora, manutencao, caixa
- `PROFESSOR`: opera chamada, calendario, provas, notas
- `ALUNO`: consulta agenda, notas, presencas e avisos
- `RESPONSAVEL`: acompanha aluno e recebe notificacoes

## Regras de negocio transversais

- Modelo multi-tenant obrigatorio por `schoolId`
- Isolamento total de dados entre escolas
- Sem delete fisico, somente cancelamento logico (`canceledAt`), exceto no purge fisico irreversivel de tenant acionado pelo MSINFOR ADMIN master
- Auditoria total em inclusao, alteracao e cancelamento
- Todos os textos em UPPERCASE (exceto senha)
- Login validado por `VIEWUSUARIOS`
- `IDENTIFICADOR_UNICO` nao pode repetir dentro da mesma escola
- Ano letivo (`AL`) e chave de negocio recorrente, sem tabela dedicada

## Convencao operacional de consulta de pessoas

Sempre que um requisito mencionar "pesquisar em pessoas", considerar a consulta consolidada em:

- `teachers` (professores)
- `students` (alunos)
- `guardians` (responsaveis)
- `users` (usuarios do sistema)
- `people` (cadastro mestre compartilhado), quando aplicavel ao fluxo

Objetivo:

- evitar ambiguidade de escopo em buscas por nome/CPF/email
- garantir visao completa por tenant no contexto administrativo

## Blocos de dados padrao

### EC - Endereco completo

- CEP (`99999-999`)
- Logradouro
- Numero
- Bairro
- Complemento
- Cidade
- Estado (UF do Brasil pre-cadastrada)

### DB - Dados basicos

- Data nascimento
- RG
- CPF (validacao obrigatoria)
- CNPJ (validacao obrigatoria)
- Apelido
- Razao social
- Telefone fixo
- WhatsApp
- Celular 01
- Celular 02
- Email
- Identificador unico
- Senha de acesso (minimo 4 caracteres)

## Regras especificas relevantes

- Campos de DB nao sao obrigatorios por padrao
- Email validado uma vez pode ser reutilizado sem nova validacao
- Ano letivo permitido: de 2020 ate ano atual + 1
- Vencimento de mensalidade permitido: dia 1 a 27
- Apenas funcao `CAIXA` pode fazer baixa manual de mensalidade
- Professor e sala nao podem ter conflito de horario no calendario
- Materia no calendario deve existir no vinculo professor x materia

## Modulo 1 - Softhouse

- Cadastro de escolas com EC + DB
- Campo de logotipo da escola
- Listagem com busca por nome
- Purge fisico definitivo de escola e dependencias apenas no fluxo master com confirmacao reforcada
- Criacao automatica de dois usuarios iniciais por escola:
  - `ADMIN` / `Admin001`
  - `MSINFOR` / `Mabelu2011`

## Modulo 2 - Escola

Cadastros principais:

- Serie (`SE`)
- Turma (`TU`)
- Serie x turma (`ST`)
- Sala de aula (`SA`)
- Professor (`F-PR`)
- Materia (`MA`)
- Professor x materia (`PM`) com valor por aula
- Responsavel (`F-RE`)
- Aluno (`F-AL`)
- Responsavel x aluno (`RA`) com parentesco
- Usuario do sistema (`US`) com funcoes
- Banco (`BA`) para integracao
- Grade curricular (`GC`) por AL x serie x materia
- Calendario letivo com agenda completa de aula

Funcionalidades complementares:

- Consulta de notas por ano letivo e serie
- Comunicados e advertencias com notificacao PWA
- Notificacoes automaticas de provas (hoje, amanha, segunda-feira e pos-feriado)

## Modulo 3 - PWA Professor

- Sincronizacao inicial e offline/online
- Sincronizacao do calendario
- Chamada por horario de aula
- Consolidacao de chamadas para aulas consecutivas equivalentes
- Finalizacao da chamada com notificacao a responsaveis
- Cadastro de prova/trabalho no calendario com notificacao
- Lancamento de notas com notificacao a aluno e responsavel

## Modulo 4 - PWA Aluno/Responsavel

- Sincronizacao por usuario logado
- Consulta de provas agendadas
- Consulta de notas e medias por materia
- Consulta de grade semanal por dia da semana
- Consulta de presenca

## Modulo 5 - Financeiro

- Geracao de contas a receber em lote por ano letivo
- Lancamentos avulsos (uniforme, apostila, etc.)
- Integracao com bancos (Sicoob/Sicredi) para boletos/Pix
- Importacao de retorno bancario para baixa automatica
- Relatorio de inadimplencia com envio de email/notificacao
- Baixa manual com calculo de juros, desconto e controle de caixa diario por usuario

## Integracoes externas previstas

- ViaCEP para consulta de CEP
- Servico de email para validacao e recuperacao de senha
- APIs bancarias para emissao e retorno de boletos

## Fora de escopo inicial

- Microservicos separados no primeiro release (iniciar como monolito modular)
- BI e analytics avancado
- App mobile nativo (usar PWA)
