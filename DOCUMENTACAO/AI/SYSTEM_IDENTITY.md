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
- Integridade historica (sem delete fisico)
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
