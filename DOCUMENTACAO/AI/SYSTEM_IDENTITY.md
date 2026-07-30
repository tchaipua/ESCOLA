# SYSTEM_IDENTITY

## Nome do sistema

SaaS Gestao Escolar Multi-tenant.

## Missao

Oferecer uma plataforma unica para operacao escolar completa (academico, comunicacao, presenca e financeiro), com isolamento total entre escolas e trilha completa de auditoria.

## Proposta de valor

- Centralizar operacao de escolas em uma unica plataforma
- Permitir rotina online/offline para professor e alunos via PWA
- Melhorar comunicacao escola-aluno-responsavel com notificacoes
- Controlar receitas escolares com integracao bancaria

## Principios inegociaveis

- Seguranca por design
- Multi-tenant sem excecoes
- Integridade historica (sem delete fisico), com unica excecao operacional para purge fisico irreversivel de escola inteira pelo MSINFOR ADMIN master
- Rastreabilidade completa de alteracoes
- Simplicidade operacional para usuarios nao tecnicos

## Perfis de usuario

- Softhouse Admin
- Escola Admin
- Gerente
- Coordenadora
- Funcionario
- Caixa
- Professor
- Aluno
- Responsavel

## Fronteiras funcionais

1. Gestao da softhouse e cadastro de escolas
2. Gestao academica da escola
3. PWA do professor
4. PWA do aluno/responsavel
5. Gestao financeira

## Regras de identidade de dados

- `schoolId` define o limite de visibilidade e operacao
- `canceledAt` define cancelamento logico
- Campos de auditoria sao obrigatorios
- Textos em uppercase, exceto senha

## Excecao operacional controlada

- As rotas locais de purge administrativo estao desativadas e respondem `410 Gone`.
- Uma futura exclusao fisica somente podera partir do MSINFOR Central com identidade forte, MFA, auditoria e confirmacao explicita do `tenantId`.
- Fora desse fluxo, continua valendo a regra de cancelamento logico com preservacao historica

## Integracoes oficiais

- ViaCEP (endereco)
- Servico de email (validacao e recuperacao)
- APIs bancarias (boletos/Pix e retorno)

## Glossario rapido

- `EC`: endereco completo
- `DB`: dados basicos
- `AL`: ano letivo
- `SE`: serie
- `TU`: turma
- `ST`: serie x turma
- `SA`: sala de aula
- `MA`: materia
- `PM`: professor x materia
- `RA`: responsavel x aluno

## Tom de comunicacao do produto

- Claro e direto
- Focado em rotina escolar
- Mensagens objetivas de erro e sucesso
- Linguagem acessivel para equipe administrativa

## Invariantes de seguranca

- Credenciais, hashes, tokens de integracao e segredos de SMTP/S3/Telegram nunca podem ser enviados ao navegador.
- O algoritmo e toda compatibilidade da senha master deterministica foram removidos, inclusive em desenvolvimento.
- Tokens master antigos e todas as rotas administrativas locais falham fechados. O identificador `MSINFOR` é aceito exclusivamente quando autenticado pela API do MSINFOR Central, sem senha local e após seleção autorizada de empresa e filial.
- A interface administrativa local apenas redireciona para a URL limpa do MSINFOR Central, sem token, senha, query string ou hash.
- Segredos SMTP, S3 e Telegram persistidos pela Escola usam AES-256-GCM versionado; `DATA_ENCRYPTION_KEY` representa exatamente 32 bytes e e obrigatoria em producao.
- A identidade administrativa forte, MFA e a sessao auditada pertencem ao MSINFOR Central.
