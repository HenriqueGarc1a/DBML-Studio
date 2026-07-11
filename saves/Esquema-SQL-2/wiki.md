# Esquema SQL 2

| [Início](#início) | [Introdução](#introdução) | [Visão Geral](#visão-geral-do-banco-de-dados) | [Dicionário de Dados](#dicionário-de-dados) | [Conclusão](#conclusão) |
| --- | --- | --- | --- | --- |

_TOC_

# Início

Esta wiki reúne a documentação técnica e funcional do banco de dados do projeto **Esquema SQL 2**.

# Introdução

O projeto **Esquema SQL 2** utiliza o esquema descrito abaixo. Use esta seção para registrar o contexto do produto, seus objetivos e o escopo desta documentação.

# Visão Geral do Banco de Dados

O banco de dados possui **16 tabelas**, **19 relacionamentos** e **0 enumerações**.

Descreva aqui como os dados se organizam, quais áreas do sistema são atendidas e quais decisões estruturais são importantes para a manutenção do projeto.

<!-- DBML-STUDIO:DATA-DICTIONARY:START -->
# Dicionário de Dados

> Conteúdo gerado a partir do esquema atual. As descrições usam as notas cadastradas nas tabelas e nos campos.

## ages\_user

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK<br>FK → `team.teacher_id`<br>FK → `class.teacher_id`<br>FK → `semester_profile.user_id`<br>FK → `otp.user_id`<br>FK → `schedule.admin_id`<br>FK → `examining_board_member.teacher_id` |
| `email` | `varchar(255)` | _A documentar._ | NOT NULL |
| `pucrs_id` | `char(8)` | _A documentar._ | NOT NULL |
| `name` | `varchar(255)` | _A documentar._ | NOT NULL |
| `password` | `varchar(255)` | _A documentar._ | NOT NULL |
| `image_url` | `varchar(255)` | _A documentar._ | — |
| `course` | `course` | _A documentar._ | NOT NULL |
| `type` | `user_type` | _A documentar._ | NOT NULL |

### Relacionamentos

- `ages_user.id` referencia `team.teacher_id` (um para muitos).
- `ages_user.id` referencia `class.teacher_id` (um para muitos).
- `ages_user.id` referencia `semester_profile.user_id` (um para muitos).
- `ages_user.id` referencia `otp.user_id` (um para muitos).
- `ages_user.id` referencia `schedule.admin_id` (um para muitos).
- `ages_user.id` referencia `examining_board_member.teacher_id` (um para muitos).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `ages_user`.


## project

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK<br>FK → `team.project_id`<br>FK → `project_stack.project_id` |
| `description` | `text` | _A documentar._ | NOT NULL |
| `git_lab` | `varchar(255)` | _A documentar._ | — |
| `name` | `varchar(255)` | _A documentar._ | NOT NULL |
| `active` | `boolean` | _A documentar._ | NOT NULL |
| `group_photo_url` | `varchar(255)` | _A documentar._ | — |
| `year` | `int` | _A documentar._ | NOT NULL |
| `semester` | `semester` | _A documentar._ | NOT NULL |
| `logo_url` | `varchar(255)` | _A documentar._ | — |

### Relacionamentos

- `project.id` referencia `team.project_id` (muitos para um).
- `project.id` referencia `project_stack.project_id` (muitos para um).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `project`.


## team

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK<br>FK → `semester_profile.team_id` |
| `teacher_id` | `uuid` | _A documentar._ | NOT NULL |
| `project_id` | `uuid` | _A documentar._ | NOT NULL |

### Relacionamentos

- `team.teacher_id` é referenciado por `ages_user.id` (muitos para um).
- `team.project_id` é referenciado por `project.id` (um para muitos).
- `team.id` referencia `semester_profile.team_id` (um para muitos).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `team`.


## class

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK<br>FK → `semester_profile.class_id`<br>FK → `lesson.class_id` |
| `number` | `int` | _A documentar._ | NOT NULL |
| `year` | `int` | _A documentar._ | NOT NULL |
| `semester` | `semester` | _A documentar._ | NOT NULL |
| `teacher_id` | `uuid` | _A documentar._ | NOT NULL |
| `active` | `boolean` | _A documentar._ | NOT NULL |

### Relacionamentos

- `class.teacher_id` é referenciado por `ages_user.id` (muitos para um).
- `class.id` referencia `semester_profile.class_id` (um para muitos).
- `class.id` referencia `lesson.class_id` (um para muitos).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `class`.


## semester\_profile

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK<br>FK → `report.student_id`<br>FK → `examining_board.student_id`<br>FK → `attendance.student_id` |
| `grade` | `numeric(4,2)` | _A documentar._ | — |
| `ages_role` | `ages_role` | _A documentar._ | NOT NULL |
| `student_status` | `semester_status` | _A documentar._ | NOT NULL |
| `user_id` | `uuid` | _A documentar._ | NOT NULL |
| `class_id` | `uuid` | _A documentar._ | NOT NULL |
| `team_id` | `uuid` | _A documentar._ | NOT NULL |

### Relacionamentos

- `semester_profile.user_id` é referenciado por `ages_user.id` (muitos para um).
- `semester_profile.team_id` é referenciado por `team.id` (muitos para um).
- `semester_profile.class_id` é referenciado por `class.id` (muitos para um).
- `semester_profile.id` referencia `report.student_id` (um para muitos).
- `semester_profile.id` referencia `examining_board.student_id` (um para um).
- `semester_profile.id` referencia `attendance.student_id` (um para muitos).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `semester_profile`.


## lesson

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK<br>FK → `attendance.lesson_id` |
| `date` | `timestamp` | _A documentar._ | NOT NULL |
| `class_id` | `uuid` | _A documentar._ | NOT NULL |

### Relacionamentos

- `lesson.class_id` é referenciado por `class.id` (muitos para um).
- `lesson.id` referencia `attendance.lesson_id` (um para muitos).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `lesson`.


## otp

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK |
| `user_id` | `uuid` | _A documentar._ | NOT NULL |
| `expires_at` | `timestamp` | _A documentar._ | NOT NULL |
| `token` | `varchar(255)` | _A documentar._ | NOT NULL |
| `used` | `boolean` | _A documentar._ | NOT NULL |

### Relacionamentos

- `otp.user_id` é referenciado por `ages_user.id` (muitos para um).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `otp`.


## schedule

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK |
| `admin_id` | `uuid` | _A documentar._ | NOT NULL |
| `event` | `char(10)` | _A documentar._ | NOT NULL |
| `event_date` | `timestamp` | _A documentar._ | NOT NULL |
| `event_period` | `char(10)` | _A documentar._ | NOT NULL |
| `event_time` | `time(0)` | _A documentar._ | NOT NULL |

### Relacionamentos

- `schedule.admin_id` é referenciado por `ages_user.id` (muitos para um).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `schedule`.


## technology

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK<br>FK → `project_stack.technology_id` |
| `name` | `varchar(255)` | _A documentar._ | NOT NULL |
| `type` | `technology_type` | _A documentar._ | NOT NULL |

### Relacionamentos

- `technology.id` referencia `project_stack.technology_id` (muitos para um).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `technology`.


## project\_stack

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK |
| `project_id` | `uuid` | _A documentar._ | NOT NULL<br>UNIQUE (`project_id`, `technology_id`) |
| `technology_id` | `uuid` | _A documentar._ | NOT NULL<br>UNIQUE (`project_id`, `technology_id`) |

### Relacionamentos

- `project_stack.project_id` é referenciado por `project.id` (um para muitos).
- `project_stack.technology_id` é referenciado por `technology.id` (um para muitos).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `project_stack`.


## report

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK<br>FK → `sprint_report.report_id`<br>FK → `hours_report.report_id` |
| `student_id` | `uuid` | _A documentar._ | NOT NULL |
| `create_date` | `timestamp` | _A documentar._ | NOT NULL |
| `edit_date` | `timestamp` | _A documentar._ | NOT NULL |
| `grade` | `numeric(4,2)` | _A documentar._ | — |
| `type` | `report_type` | _A documentar._ | NOT NULL |
| `url_archive` | `varchar(255)` | _A documentar._ | — |
| `comment` | `text` | _A documentar._ | — |
| `correction_url` | `varchar(255)` | _A documentar._ | — |
| `revision_date` | `timestap` | _A documentar._ | — |

### Relacionamentos

- `report.student_id` é referenciado por `semester_profile.id` (muitos para um).
- `report.id` referencia `sprint_report.report_id` (um para um).
- `report.id` referencia `hours_report.report_id` (um para um).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `report`.


## examining\_board

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK<br>FK → `examining_board_member.examining_board_id` |
| `date` | `date` | _A documentar._ | NOT NULL |
| `grade` | `numeric(4,2)` | _A documentar._ | NOT NULL |
| `room` | `varchar(255)` | _A documentar._ | NOT NULL |
| `student_id` | `uuid` | _A documentar._ | NOT NULL |

### Relacionamentos

- `examining_board.student_id` é referenciado por `semester_profile.id` (um para um).
- `examining_board.id` referencia `examining_board_member.examining_board_id` (um para muitos).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `examining_board`.


## examining\_board\_member

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK |
| `examining_board_id` | `uuid` | _A documentar._ | NOT NULL |
| `teacher_id` | `uuid` | _A documentar._ | NOT NULL |

### Relacionamentos

- `examining_board_member.examining_board_id` é referenciado por `examining_board.id` (muitos para um).
- `examining_board_member.teacher_id` é referenciado por `ages_user.id` (muitos para um).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `examining_board_member`.


## attendance

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK |
| `lesson_id` | `uuid` | _A documentar._ | NOT NULL |
| `student_id` | `uuid` | _A documentar._ | NOT NULL |

### Relacionamentos

- `attendance.lesson_id` é referenciado por `lesson.id` (muitos para um).
- `attendance.student_id` é referenciado por `semester_profile.id` (muitos para um).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `attendance`.


## sprint\_report

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK |
| `activity_completed` | `text` | _A documentar._ | NOT NULL |
| `learned_lessons` | `text` | _A documentar._ | NOT NULL |
| `next_steps` | `text` | _A documentar._ | NOT NULL |
| `predicted_activity` | `text` | _A documentar._ | NOT NULL |
| `problems_encountered` | `text` | _A documentar._ | NOT NULL |
| `sprint` | `sprint` | _A documentar._ | NOT NULL |
| `report_id` | `uuid` | _A documentar._ | NOT NULL<br>UNIQUE |

### Relacionamentos

- `sprint_report.report_id` é referenciado por `report.id` (um para um).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `sprint_report`.


## hours\_report

> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.

| Campo | Tipo | Descrição | Restrição |
| --- | --- | --- | --- |
| `id` | `uuid` | _A documentar._ | PK |
| `activities` | `text` | _A documentar._ | — |
| `entry_time` | `timestamp` | _A documentar._ | NOT NULL |
| `exit_time` | `timestamp` | _A documentar._ | — |
| `rejection_justification` | `text` | _A documentar._ | — |
| `approved` | `boolean` | _A documentar._ | NOT NULL |
| `report_id` | `uuid` | _A documentar._ | NOT NULL<br>UNIQUE |

### Relacionamentos

- `hours_report.report_id` é referenciado por `report.id` (um para um).

### Regras de Negócio

- [ ] Documentar as regras de negócio relacionadas à tabela `hours_report`.
<!-- DBML-STUDIO:DATA-DICTIONARY:END -->

# Conclusão

Use esta seção para resumir os principais pontos do modelo de dados, decisões relevantes e próximos passos da documentação.
