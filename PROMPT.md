# Prompt para continuar o DBML Studio

Voce esta trabalhando no DBML Studio, uma ferramenta profissional em TypeScript, React e SVG para editar diagramas ER a partir de DBML.

Prioridades:

- Manter arquitetura modular em `parser/`, `model/`, `layout/`, `renderer/`, `editor/`, `exporter/`, `ui/` e `utils/`.
- Preservar compatibilidade com DBML oficial; metadados visuais devem continuar apenas em comentarios especiais `@table`, `@line` e `@group`.
- Evitar Canvas; a renderizacao principal deve continuar em SVG.
- Antes de alterar comportamento, cobrir parser/exportadores com testes focados.
- Usar imports dinamicos para dependencias pesadas como ELK e exportadores quando isso reduzir o bundle inicial.
- Manter modo claro/escuro consistente por variaveis CSS, sem sobrescrever cores explicitamente definidas pelo DBML importado.

Proximo bom incremento:

1. Adicionar zoom e pan no SVG com limites ergonomicos.
2. Criar undo/redo para edicoes visuais.
3. Melhorar parser DBML para `Project`, `TableGroup`, refs compostas e notas multiline.
4. Adicionar exportacao SVG/PNG com escala configuravel.
5. Criar testes de interacao para mover tabelas, editar propriedades e exportar layout.
