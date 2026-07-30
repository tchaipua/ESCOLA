# PROJECT_CONTEXT

## Visao geral

Plataforma SaaS de gestao escolar multi-tenant com 5 frentes:

1. Gerenciamento da softhouse (cadastro e administracao de escolas)
2. Gerenciamento operacional da escola (cadastros academicos e agenda)
3. PWA do professor (chamada, provas, notas, notificacoes)
4. PWA do aluno/responsavel (rotina escolar, notas, presenca, avisos)
5. Gerenciamento financeiro (contas a receber, boletos, baixa e cobranca)

## Sistemas integrados do ecossistema local

O trabalho local acontece em dois sistemas/repositories separados e integrados:

- `C:\Sistemas\IA\Escola`: sistema escolar, com backend/frontend da gestao academica, softhouse, PWAs e camada de integracao com o financeiro
- `C:\Sistemas\IA\Financeiro`: sistema financeiro desacoplado, com backend/frontend proprios e documentacao propria em `C:\Sistemas\IA\Financeiro\DOCUMENTACAO\AI`

O `Financeiro` nao deve ser considerado apenas um modulo interno do repositorio `Escola`. Ele e um sistema separado, integrado por API/contrato tecnico.

Regra de responsabilidade:

- a `Escola` continua dona das regras escolares, como aluno, responsavel/pagador, mensalidade, filial e permissao do usuario escolar
- o `Financeiro` e dono da operacao financeira pesada, como titulos, parcelas, caixa, baixas, contas a pagar, produtos, estoque financeiro/fiscal, certificados e integracoes bancarias/fiscais

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
- Sem delete fisico operacional; a rota local de purge administrativo esta desativada e qualquer fluxo futuro pertence ao MSINFOR Central
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
- Purge fisico local desativado; futura operacao exige identidade forte e confirmacao reforcada no MSINFOR Central
- Criacao do administrador inicial com senha informada no onboarding seguro

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

## Seguranca consolidada (2026-07-24)

- O algoritmo de senha master foi removido de backend, frontend, scripts e testes; nao existe compatibilidade local.
- Tokens master antigos e rotas administrativas locais falham fechados; o usuário `MSINFOR` é aceito somente pela identidade HMAC da Central, sem credencial local e com empresa/filial autorizadas. `/msinfor-admin` continua redirecionando para o Central sem credencial na URL ou no storage.
- Em produção, todo login comum também é validado pelo MSINFOR Central via
  HMAC backend a backend. O tenant global é ligado ao banco local por
  `centralTenantId`; alias, tenant e papel nunca vêm de parâmetro de URL
  confiável.
- JWTs possuem `jti`, ficam exclusivamente no cookie HttpOnly e só são aceitos
  enquanto a linha correspondente em `auth_sessions` estiver ativa. Bearer,
  tokens no storage e token no corpo do login são recusados. Logout e eventos
  de credencial revogam a sessão imediatamente.
- `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, banco, URLs HTTPS e chaves HMAC direcionais do Financeiro/Central sao validados no startup de producao.
- Mutações autenticadas por cookie exigem CSRF assinado, `Origin` permitido e
  Fetch Metadata de mesma origem; o frontend usa `/api/v1` sem endereço externo
  embutido.
- SMTP, Telegram e S3 locais sao cifrados com AES-256-GCM versionado e migrados automaticamente, de forma idempotente, apos backup local criptografado.
- Respostas nunca incluem senha SMTP, token Telegram, segredo S3 ou tokens de verificacao. Somente flags `has*` podem indicar configuracao existente.
- SQLite continua como ponte local; o schema e baseline PostgreSQL estao preparados em paralelo, com RLS deliberadamente fora do deploy automatico.
- Em PostgreSQL, migrator e runtime usam credenciais diferentes. O runtime
  verifica no startup que sua role não é owner, superuser, criadora de banco ou
  role, `BYPASSRLS`, `REPLICATION` nem possui DDL no banco/schema.
- O Financeiro é servido pela mesma origem da Escola; iframe contém somente estado de apresentação e toda API passa pelo BFF autenticado.
