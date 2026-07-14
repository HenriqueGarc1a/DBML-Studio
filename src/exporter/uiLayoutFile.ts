import type { DiagramModel, RelationModel, TableModel } from "../model/types";

interface UiLayoutFile {
  version: 1;
  visual: DiagramModel["visual"];
  tables: Array<Pick<TableModel, "id" | "name" | "x" | "y" | "width" | "height" | "visual" | "usesDefaultStyle" | "usesGroupStyle" | "layoutSource" | "columnOrder">>;
  relations: Array<RelationModel>;
  groups: DiagramModel["groups"];
}

export function exportUiLayout(diagram: DiagramModel): string {
  const file: UiLayoutFile = {
    version: 1,
    visual: diagram.visual,
    tables: diagram.tables.map(({ id, name, x, y, width, height, visual, usesDefaultStyle, usesGroupStyle, layoutSource, columnOrder }) => ({
      id, name, x, y, width, height, visual, usesDefaultStyle, usesGroupStyle, layoutSource, columnOrder,
    })),
    relations: diagram.relations,
    groups: diagram.groups,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function applyUiLayout(diagram: DiagramModel, source?: string): DiagramModel {
  if (!source?.trim()) return diagram;
  const file = JSON.parse(source) as Partial<UiLayoutFile>;
  if (file.version !== 1) throw new Error("Versão do arquivo de UI não suportada.");

  const tableLayouts = new Map((file.tables ?? []).flatMap((table) => [
    [table.id, table] as const,
    [table.name, table] as const,
  ]));
  const relationLayouts = new Map((file.relations ?? []).map((relation) => [relationKey(relation), relation]));

  return {
    ...diagram,
    visual: file.visual ? { ...diagram.visual, ...file.visual } : diagram.visual,
    tables: diagram.tables.map((table) => {
      const layout = tableLayouts.get(table.id) ?? tableLayouts.get(table.name);
      return layout ? { ...table, ...layout, id: table.id, name: table.name, columns: table.columns } : table;
    }),
    relations: diagram.relations.map((relation) => {
      const layout = relationLayouts.get(relationKey(relation));
      return layout ? {
        ...relation,
        ...layout,
        id: relation.id,
        fromTable: relation.fromTable,
        fromColumn: relation.fromColumn,
        fromColumns: relation.fromColumns,
        toTable: relation.toTable,
        toColumn: relation.toColumn,
        toColumns: relation.toColumns,
      } : relation;
    }),
    groups: file.groups ?? diagram.groups,
  };
}

function relationKey(relation: Pick<RelationModel, "fromTable" | "fromColumn" | "toTable" | "toColumn">): string {
  const composite = relation as Pick<RelationModel, "fromTable" | "fromColumn" | "fromColumns" | "toTable" | "toColumn" | "toColumns">;
  return `${composite.fromTable}.${(composite.fromColumns ?? [composite.fromColumn]).join(",")}>${composite.toTable}.${(composite.toColumns ?? [composite.toColumn]).join(",")}`;
}
