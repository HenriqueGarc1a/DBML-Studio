import { Database } from "lucide-react";
import { applyUiLayout } from "../../exporter/uiLayoutFile";
import { parseDbml } from "../../parser/dbmlParser";
import { getRelationGeometry } from "../../utils/geometry";

interface DiagramPreviewProps {
  dbml: string;
  uiLayout?: string;
  previewDataUrl?: string;
}

export function DiagramPreview({ dbml, uiLayout, previewDataUrl }: DiagramPreviewProps) {
  if (previewDataUrl) return <img className="diagram-card-preview" src={previewDataUrl} alt="Prévia do esquema" />;
  try {
    const diagram = applyUiLayout(parseDbml(dbml), uiLayout);
    if (!diagram.tables.length) return <EmptyPreview />;
    const padding = 36;
    const left = Math.min(...diagram.tables.map((table) => table.x)) - padding;
    const top = Math.min(...diagram.tables.map((table) => table.y)) - padding;
    const right = Math.max(...diagram.tables.map((table) => table.x + table.width)) + padding;
    const bottom = Math.max(...diagram.tables.map((table) => table.y + table.height)) + padding;
    const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));
    return (
      <svg className="diagram-card-preview" viewBox={`${left} ${top} ${Math.max(1, right - left)} ${Math.max(1, bottom - top)}`} aria-label="Prévia do esquema">
        <rect x={left} y={top} width={right - left} height={bottom - top} className="preview-background" />
        {diagram.relations.map((relation) => {
          const from = tableMap.get(relation.fromTable);
          const to = tableMap.get(relation.toTable);
          return from && to ? <path key={relation.id} d={getRelationGeometry(relation, from, to).path} className="preview-relation" /> : null;
        })}
        {diagram.tables.map((table) => (
          <g key={table.id}>
            <rect x={table.x} y={table.y} width={table.width} height={table.height} rx={6} className="preview-table" />
            <rect x={table.x} y={table.y} width={table.width} height={38} rx={6} className="preview-table-header" />
          </g>
        ))}
      </svg>
    );
  } catch {
    return <EmptyPreview />;
  }
}

function EmptyPreview() {
  return <span className="diagram-card-preview is-empty"><Database size={28} /></span>;
}
