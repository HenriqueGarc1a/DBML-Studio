# TesteSQL

| [Início](#início) | [Introdução](#introdução) | [Visão Geral](#visão-geral-do-banco-de-dados) | [Dicionário de Dados](#dicionário-de-dados) | [Conclusão](#conclusão) |
| --- | --- | --- | --- | --- |

_TOC_

# Início

Esta wiki reúne a documentação técnica e funcional do banco de dados do projeto **TesteSQL**.

# Introdução

O projeto **TesteSQL** utiliza o esquema descrito abaixo. Use esta seção para registrar o contexto do produto, seus objetivos e o escopo desta documentação.

# Visão Geral do Banco de Dados

O banco de dados possui **2 tabelas**, **1 relacionamento** e **0 enumerações**.

Descreva aqui como os dados se organizam, quais áreas do sistema são atendidas e quais decisões estruturais são importantes para a manutenção do projeto.

<!-- DBML-STUDIO:DATA-DICTIONARY:START -->
# Dicionário de Dados

> Conteúdo gerado a partir do esquema atual. As descrições usam as notas cadastradas nas tabelas e nos campos.

## usuario

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `int` | _A documentar._ | PK |
| `nome` | `varchar(100)` | _A documentar._ | NOT NULL |
| `email` | `varchar(150)` | _A documentar._ | NOT NULL<br>UNIQUE |
| `senha` | `varchar(255)` | _A documentar._ | NOT NULL |
| `criado_em` | `timestamp` | _A documentar._ | NOT NULL<br>DEFAULT `CURRENT_TIMESTAMP` |

### Relacionamentos

- `usuario.id` é referenciado por `carro.usuario_id` (um para muitos).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `usuario`.


## carro

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `int` | _A documentar._ | PK |
| `usuario_id` | `int` | _A documentar._ | FK → `usuario.id` |
| `marca` | `varchar(50)` | _A documentar._ | NOT NULL |
| `modelo` | `varchar(80)` | _A documentar._ | NOT NULL |
| `ano` | `int` | _A documentar._ | NOT NULL |

### Relacionamentos

- `carro.usuario_id` referencia `usuario.id` (muitos para um).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `carro`.
<!-- DBML-STUDIO:DATA-DICTIONARY:END -->

# Conclusão

Use esta seção para resumir os principais pontos do modelo de dados, decisões relevantes e próximos passos da documentação.
