# ACCESS MATRIX

## Objetivo

Definir a matriz oficial de autorizacao do sistema escolar, usando:

- perfil pre-definido por funcao
- permissao especifica por tela/modulo
- prioridade da permissao especifica sobre o perfil
- validacao obrigatoria de tenant

## Regra de precedencia

Ordem de avaliacao para qualquer conta com acesso:

1. Se houver permissoes especificas gravadas no cadastro, elas passam a valer.
2. Se nao houver customizacao, o sistema usa o perfil pre-definido.
3. O papel base continua limitando o contexto funcional da conta.
4. O tenant da escola continua obrigatorio em toda operacao.

Resumo pratico:

- perfil acelera cadastro
- excecao por tela resolve casos especiais
- tenant nunca pode ser burlado
- backend e frontend devem respeitar a mesma decisao

## Perfis padrao oficiais

| Perfil | Papel base | Objetivo |
| --- | --- | --- |
| `ADMIN_TOTAL` | `ADMIN` | Gestao completa da escola |
| `SECRETARIA_PADRAO` | `SECRETARIA` | Operacao escolar e cadastros administrativos |
| `COORDENACAO_PEDAGOGICA` | `COORDENACAO` | Operacao pedagogica, horarios e grade |
| `PROFESSOR_PADRAO` | `PROFESSOR` | Acesso proprio no app do professor |
| `ALUNO_CONSULTA` | `ALUNO` | Consulta propria no app do aluno |
| `RESPONSAVEL_CONSULTA` | `RESPONSAVEL` | Consulta propria no app do responsavel |

## Catalogo de permissoes administrativas

| Permissao | Significado |
| --- | --- |
| `VIEW_DASHBOARD` | Visualizar painel inicial |
| `VIEW_OWN_PROFILE` | Visualizar os proprios dados cadastrados |
| `VIEW_OWN_SCHEDULE` | Visualizar o proprio horario ou o horario dos alunos vinculados |
| `VIEW_USERS` | Visualizar usuarios de acesso da escola |
| `MANAGE_USERS` | Cadastrar, editar e desativar usuarios de acesso |
| `VIEW_TEACHERS` | Visualizar professores |
| `MANAGE_TEACHERS` | Cadastrar, editar e desativar professores |
| `VIEW_STUDENTS` | Visualizar alunos |
| `MANAGE_STUDENTS` | Cadastrar, editar e desativar alunos |
| `VIEW_GUARDIANS` | Visualizar responsaveis |
| `MANAGE_GUARDIANS` | Cadastrar, editar e desativar responsaveis |
| `VIEW_SUBJECTS` | Visualizar disciplinas |
| `MANAGE_SUBJECTS` | Cadastrar, editar e desativar disciplinas |
| `VIEW_CLASSES` | Visualizar turmas-base |
| `MANAGE_CLASSES` | Cadastrar, editar e desativar turmas-base |
| `VIEW_SERIES` | Visualizar series |
| `MANAGE_SERIES` | Cadastrar, editar e desativar series |
| `VIEW_SERIES_CLASSES` | Visualizar vinculo serie x turma |
| `MANAGE_SERIES_CLASSES` | Gerenciar vinculo serie x turma |
| `VIEW_ENROLLMENTS` | Visualizar matriculas |
| `MANAGE_ENROLLMENTS` | Gerenciar matriculas |
| `VIEW_SCHEDULES` | Visualizar horarios das aulas |
| `MANAGE_SCHEDULES` | Gerenciar horarios das aulas |
| `VIEW_CLASS_SCHEDULES` | Visualizar grade horaria |
| `MANAGE_CLASS_SCHEDULES` | Gerenciar grade horaria |
| `VIEW_SCHOOL_YEARS` | Visualizar anos letivos |
| `MANAGE_SCHOOL_YEARS` | Gerenciar anos letivos |

## Matriz oficial do web admin

Legenda:

- `TOTAL`: consulta e manutencao
- `OPERACIONAL`: consulta e manutencao dentro do escopo da funcao
- `CONSULTA`: apenas visualizacao
- `PWA`: usar somente no aplicativo proprio
- `BLOQUEADO`: sem acesso no web admin

| Modulo / Tela | ADMIN | SECRETARIA | COORDENACAO | PROFESSOR | ALUNO | RESPONSAVEL |
| --- | --- | --- | --- | --- | --- | --- |
| Painel central | TOTAL | OPERACIONAL | OPERACIONAL | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Usuarios de acesso da escola | TOTAL | BLOQUEADO | BLOQUEADO | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Professores | TOTAL | CONSULTA | OPERACIONAL | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Alunos | TOTAL | OPERACIONAL | CONSULTA | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Responsaveis | TOTAL | OPERACIONAL | CONSULTA | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Disciplinas | TOTAL | CONSULTA | OPERACIONAL | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Series | TOTAL | OPERACIONAL | CONSULTA | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Turmas | TOTAL | OPERACIONAL | CONSULTA | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Horario das aulas | TOTAL | CONSULTA | OPERACIONAL | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Grade horaria | TOTAL | CONSULTA | OPERACIONAL | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Vinculo serie x turma | TOTAL | OPERACIONAL | CONSULTA | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Matriculas | TOTAL | OPERACIONAL | CONSULTA | BLOQUEADO | BLOQUEADO | BLOQUEADO |

## Regra funcional por papel

### ADMIN

- administra toda a escola
- pode cadastrar, alterar e desativar registros administrativos
- pode receber excecoes finas por tela, mas por padrao usa acesso total

### SECRETARIA

- opera alunos, responsaveis, turmas, series e matriculas
- pode consultar professores, disciplinas, horarios e grade
- nao administra usuarios de acesso da escola por padrao
- nao gerencia grade horaria por padrao

### COORDENACAO

- opera professores, disciplinas, horarios das aulas e grade horaria
- consulta alunos, responsaveis, series, turmas e matriculas
- nao administra usuarios de acesso da escola por padrao

### PROFESSOR

- nao usa web admin para cadastros administrativos
- deve usar o PWA proprio para operacao pedagogica futura
- por padrao nao cadastra aluno, nao mexe na grade geral e nao altera estrutura escolar

### ALUNO

- nao usa web admin
- deve usar o PWA proprio para consulta dos seus dados
- sem permissao de manutencao administrativa

### RESPONSAVEL

- nao usa web admin
- deve usar o PWA proprio para consulta dos alunos vinculados
- sem permissao de manutencao administrativa

## Diretriz para PWAs

As permissoes administrativas acima nao substituem as regras de dados proprios nos aplicativos moveis/web progressivos.

Diretriz obrigatoria:

- `PROFESSOR` ve apenas dados ligados a ele
- `ALUNO` ve apenas os proprios dados
- `RESPONSAVEL` ve apenas os alunos vinculados a ele

Permissoes futuras esperadas:

- `VIEW_OWN_SCHEDULE`
- `VIEW_OWN_CLASSES`
- `VIEW_OWN_STUDENTS`
- `VIEW_OWN_GRADES`
- `VIEW_OWN_ATTENDANCE`
- `VIEW_OWN_NOTIFICATIONS`

## Regras de implementacao

- toda rota sensivel deve validar permissao no backend
- o frontend deve esconder menu, botoes e acoes sem permissao
- quando houver bloqueio, a tela deve mostrar mensagem amigavel de acesso restrito
- salvar lista vazia de permissoes especificas deve limpar a customizacao e voltar ao perfil
- nenhuma permissao pode ultrapassar o tenant da escola selecionada

## Fluxo recomendado de cadastro

### Professor

1. escolher perfil `PROFESSOR_PADRAO`
2. salvar credenciais
3. apenas se houver excecao, marcar telas/permissoes especificas

### Aluno

1. escolher perfil `ALUNO_CONSULTA`
2. salvar credenciais
3. apenas se houver excecao, marcar telas/permissoes especificas

### Responsavel

1. escolher perfil `RESPONSAVEL_CONSULTA`
2. salvar credenciais
3. apenas se houver excecao, marcar telas/permissoes especificas

### Secretaria e Coordenacao

1. escolher o perfil padrao da funcao
2. revisar se a escola precisa de alguma excecao
3. aplicar permissao especifica somente quando houver caso real

## Estado atual do projeto

Ja implementado no codigo:

- perfis pre-definidos para `ADMIN`, `SECRETARIA`, `COORDENACAO`, `PROFESSOR`, `ALUNO` e `RESPONSAVEL`
- override por permissao especifica para usuario individual
- validacao de permissao no backend
- ocultacao/bloqueio de telas no frontend administrativo
- edicao de perfil individual em professores, alunos e responsaveis
- consulta de `meu cadastro` para `PROFESSOR`, `ALUNO` e `RESPONSAVEL`
- consulta de `meu horario` para `PROFESSOR`, `ALUNO` e `RESPONSAVEL`

Pendente para fases futuras:

- matriz detalhada dos proximos `VIEW_OWN_*` nos PWAs
- telas operacionais dos PWAs usando essa mesma matriz
