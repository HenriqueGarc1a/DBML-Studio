import type { ColumnModel, DiagramModel, GroupModel, RelationModel, TableModel } from "../model/types";

export function exportDbml(diagram: DiagramModel): string {
  const sections: string[] = [exportDiagram(diagram)];
  const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));

  for (const table of diagram.tables) {
    sections.push(exportTable(table));
  }

  for (const item of diagram.enums) {
    sections.push(`Enum ${formatIdentifier(item.name)} {\n${item.values.map((value) => `  ${formatIdentifier(value)}`).join("\n")}\n}`);
  }

  for (const relation of diagram.relations) {
    sections.push(exportRelation(relation, tableMap));
  }

  for (const group of diagram.groups) {
    sections.push(exportGroup(group));
  }

  return `${sections.join("\n\n")}\n`;
}

function exportDiagram(diagram: DiagramModel): string {
  const { visual } = diagram;
  const badgeComments = [
    ...exportBadge("pk", visual.badges.primaryKey),
    ...exportBadge("fk", visual.badges.foreignKey),
    ...exportBadge("notNull", visual.badges.notNull),
    ...exportBadge("unique", visual.badges.unique),
  ];

  return [
    "// @diagram",
    `// background=${visual.backgroundColor}`,
    `// gridColor=${visual.gridColor}`,
    `// gridSize=${round(visual.gridSize, 0)}`,
    `// tableBackground=${visual.defaultTable.backgroundColor}`,
    `// tableBorder=${visual.defaultTable.borderColor}`,
    `// tableHeader=${visual.defaultTable.headerColor}`,
    `// tableText=${visual.defaultTable.textColor}`,
    `// tableOpacity=${round(visual.defaultTable.opacity, 2)}`,
    ...badgeComments,
    visual.savedColors.length ? `// savedColors=${visual.savedColors.map(exportSavedColor).join(",")}` : "",
  ].filter(Boolean).join("\n");
}

function exportTable(table: TableModel): string {
  const comments = [
    `// @table ${table.name}`,
    `// x=${round(table.x)}`,
    `// y=${round(table.y)}`,
    `// width=${round(table.width)}`,
    `// height=${round(table.height)}`,
    `// useDefaultStyle=${table.usesDefaultStyle}`,
    ...(!table.usesDefaultStyle
      ? [
          `// background=${table.visual.backgroundColor}`,
          `// border=${table.visual.borderColor}`,
          `// header=${table.visual.headerColor}`,
          `// text=${table.visual.textColor}`,
          `// opacity=${round(table.visual.opacity, 2)}`,
        ]
      : []),
  ];

  const columns = table.columns.map((column) => `  ${exportColumn(column)}`);
  const note = table.note ? [`  Note: '${escapeSingle(table.note)}'`] : [];
  const indexes = table.indexes.length
    ? [
        "  indexes {",
        ...table.indexes.map((index) => {
          const settings = [
            index.unique ? "unique" : "",
            index.primary ? "pk" : "",
          ].filter(Boolean);
          const suffix = settings.length ? ` [${settings.join(", ")}]` : "";
          return `    (${index.columns.map(formatIdentifier).join(", ")})${suffix}`;
        }),
        "  }",
      ]
    : [];

  return `${comments.join("\n")}\nTable ${formatIdentifier(table.name)} {\n${[
    ...columns,
    ...note,
    ...indexes,
  ].join("\n")}\n}`;
}

function exportBadge(
  prefix: "pk" | "fk" | "notNull" | "unique",
  visual: DiagramModel["visual"]["badges"]["primaryKey"],
): string[] {
  return [
    `// ${prefix}BadgeBackground=${visual.backgroundColor}`,
    `// ${prefix}BadgeBorder=${visual.borderColor}`,
    `// ${prefix}BadgeText=${visual.textColor}`,
  ];
}

function exportSavedColor(item: DiagramModel["visual"]["savedColors"][number]): string {
  return `${encodeURIComponent(item.name)}:${item.color}`;
}

function exportColumn(column: ColumnModel): string {
  const settings = new Set<string>();

  if (!column.nullable) settings.add("not null");
  if (column.primaryKey) settings.add("pk");
  if (column.unique) settings.add("unique");
  if (column.defaultValue) settings.add(`default: ${column.defaultValue}`);
  if (column.note) settings.add(`note: '${escapeSingle(column.note)}'`);

  for (const setting of column.rawSettings) {
    const lower = setting.toLowerCase();
    const isManaged =
      lower.startsWith("ref:") ||
      lower === "not null" ||
      lower === "not_null" ||
      lower === "pk" ||
      lower === "primary key" ||
      lower === "unique" ||
      lower.startsWith("default:") ||
      lower.startsWith("note:");

    if (!isManaged) {
      settings.add(setting);
    }
  }

  const suffix = settings.size ? ` [${Array.from(settings).join(", ")}]` : "";
  return `${formatIdentifier(column.name)} ${column.type}${suffix}`;
}

function exportRelation(relation: RelationModel, tableMap: Map<string, TableModel>): string {
  const fromTable = tableMap.get(relation.fromTable)?.name ?? relation.fromTable;
  const toTable = tableMap.get(relation.toTable)?.name ?? relation.toTable;
  const comments = [
    `// @line ${relation.id}`,
    `// color=${relation.color}`,
    `// strokeWidth=${round(relation.strokeWidth, 2)}`,
    `// opacity=${round(relation.opacity, 2)}`,
    `// style=${relation.style}`,
    `// route=${relation.route}`,
    `// from=${relation.fromSide}`,
    `// to=${relation.toSide}`,
    `// startOffsetX=${round(relation.startOffsetX, 2)}`,
    `// startOffsetY=${round(relation.startOffsetY, 2)}`,
    `// endOffsetX=${round(relation.endOffsetX, 2)}`,
    `// endOffsetY=${round(relation.endOffsetY, 2)}`,
    relation.label ? `// label=${relation.label}` : "",
    relation.viaPoints.length
      ? `// via=${relation.viaPoints.map((point) => `(${round(point.x)},${round(point.y)})`).join(",")}`
      : "",
  ].filter(Boolean);

  return `Ref: ${formatIdentifier(fromTable)}.${formatIdentifier(
    relation.fromColumn,
  )} > ${formatIdentifier(toTable)}.${formatIdentifier(relation.toColumn)}\n${comments.join("\n")}`;
}

function exportGroup(group: GroupModel): string {
  return [
    `// @group ${group.id.replace(/^group-/, "")}`,
    `// label=${group.label}`,
    `// x=${round(group.x)}`,
    `// y=${round(group.y)}`,
    `// width=${round(group.width)}`,
    `// height=${round(group.height)}`,
    `// background=${group.backgroundColor}`,
    `// border=${group.borderColor}`,
    `// opacity=${round(group.opacity, 2)}`,
  ].join("\n");
}

function formatIdentifier(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`;
}

function escapeSingle(value: string): string {
  return value.replace(/'/g, "\\'");
}

function round(value: number, digits = 1): string {
  return Number(value.toFixed(digits)).toString();
}
