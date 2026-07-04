export const demoDbml = `// @diagram
// background=#0f172a
// gridColor=#1f2a3a
// gridSize=4

// @table user
// x=80
// y=80
// width=260
// background=#111827
// border=#60a5fa
// header=#1e3a5f
// text=#e5edf7

Table user {
  id int [pk, not null]
  name varchar [not null]
  email varchar [not null, unique]
  role user_role [not null]
}

// @table project
// x=480
// y=80
// width=260
// background=#111827
// border=#4b5f78
// header=#253142
// text=#e5edf7

Table project {
  id int [pk, not null]
  user_id int [not null]
  name varchar [not null]
  status varchar [default: 'active']

  indexes {
    (user_id, name) [unique]
  }
}

// @table technology
// x=480
// y=260
// width=260
// background=#111827
// border=#4b5f78
// header=#12312e
// text=#e5edf7

Table technology {
  id int [pk, not null]
  project_id int [not null]
  name varchar [not null]
}

Enum user_role {
  admin
  editor
  viewer
}

Ref: project.user_id > user.id
// @line
// color=#dc2626
// strokeWidth=2
// opacity=0.85
// style=dashed
// route=orthogonal
// from=west
// to=east
// via=(380,150),(380,110)

Ref: technology.project_id > project.id
// @line
// color=#0f766e
// strokeWidth=2
// opacity=0.9
// style=rounded
// route=orthogonal
// from=west
// to=east

// @group backend
// label=Backend Core
// x=40
// y=38
// width=820
// height=430
// background=#0f766e
// border=#0f766e
// opacity=0.1
// tables=user,project,technology
`;
