export const demoDbml = `// @diagram
// background=#f8fafc
// gridColor=#d7dee8
// gridSize=4

// @table user
// x=80
// y=80
// width=260
// background=#ffffff
// border=#2563eb
// header=#dbeafe
// text=#111827

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
// background=#ffffff
// border=#64748b
// header=#e0f2fe
// text=#111827

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
// background=#ffffff
// border=#64748b
// header=#ccfbf1
// text=#111827

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
