import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";
import type { DiagramController } from "../editor/useDiagramController";
import { DIAGRAM_MAX_GRID_SIZE, DIAGRAM_MIN_GRID_SIZE, getTableMinHeight } from "../model/defaults";
import type { ColumnModel, Direction, LineRoute, LineStyle, Point, TableModel } from "../model/types";
import { getRelationGeometry } from "../utils/geometry";
import { snapPoint } from "../utils/grid";

interface PropertiesPanelProps {
  controller: DiagramController;
  collapsed: boolean;
  onToggle: () => void;
}

export function PropertiesPanel({ controller, collapsed, onToggle }: PropertiesPanelProps) {
  const selection = controller.selected;
  const table = selection?.type === "table"
    ? controller.diagram.tables.find((item) => item.id === selection.id)
    : undefined;
  const relation = selection?.type === "relation"
    ? controller.diagram.relations.find((item) => item.id === selection.id)
    : undefined;
  const group = selection?.type === "group"
    ? controller.diagram.groups.find((item) => item.id === selection.id)
    : undefined;

  return (
    <aside className={`properties-pane${collapsed ? " is-collapsed" : ""}`}>
      <div className="pane-heading">
        {!collapsed && <h2>Propriedades</h2>}
        <button
          type="button"
          className="pane-toggle icon-button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Mostrar propriedades" : "Recolher propriedades"}
          title={collapsed ? "Mostrar propriedades" : "Recolher propriedades"}
        >
          {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
      {!collapsed && !selection && (
        <section className="property-section">
          <h3>Diagrama</h3>
          <ColorField
            label="Fundo"
            value={controller.diagram.visual.backgroundColor}
            onChange={(backgroundColor) => controller.updateDiagramVisual({ backgroundColor })}
          />
          <ColorField
            label="Cor grid"
            value={controller.diagram.visual.gridColor}
            onChange={(gridColor) => controller.updateDiagramVisual({ gridColor })}
          />
          <NumberField
            label="Grid"
            value={controller.diagram.visual.gridSize}
            min={DIAGRAM_MIN_GRID_SIZE}
            max={DIAGRAM_MAX_GRID_SIZE}
            step={1}
            onChange={(gridSize) => controller.updateDiagramVisual({ gridSize })}
          />
        </section>
      )}
      {!collapsed && table && (
        <section className="property-section">
          <h3>Tabela</h3>
          <TextField label="Nome" value={table.name} onChange={(name) => controller.updateTable(table.id, { name })} />
          <NumberField label="X" value={table.x} onChange={(x) => controller.updateTable(table.id, { x })} />
          <NumberField label="Y" value={table.y} onChange={(y) => controller.updateTable(table.id, { y })} />
          <NumberField label="Largura" value={table.width} onChange={(width) => controller.resizeTable(table.id, width, table.height)} />
          <NumberField
            label="Altura"
            value={table.height}
            min={getTableMinHeight(table.columns.length)}
            onChange={(height) => controller.resizeTable(table.id, table.width, height)}
          />
          <ColorField label="Fundo" value={table.visual.backgroundColor} onChange={(backgroundColor) => controller.updateTable(table.id, { visual: { ...table.visual, backgroundColor } })} />
          <ColorField label="Borda" value={table.visual.borderColor} onChange={(borderColor) => controller.updateTable(table.id, { visual: { ...table.visual, borderColor } })} />
          <ColorField label="Cabecalho" value={table.visual.headerColor} onChange={(headerColor) => controller.updateTable(table.id, { visual: { ...table.visual, headerColor } })} />
          <ColorField label="Texto" value={table.visual.textColor} onChange={(textColor) => controller.updateTable(table.id, { visual: { ...table.visual, textColor } })} />
          <RangeField label="Opacidade" value={table.visual.opacity} min={0.1} max={1} step={0.05} onChange={(opacity) => controller.updateTable(table.id, { visual: { ...table.visual, opacity } })} />
          <TableColumnsEditor controller={controller} table={table} />
        </section>
      )}
      {!collapsed && relation && (
        <RelationProperties controller={controller} relationId={relation.id} />
      )}
      {!collapsed && group && (
        <section className="property-section">
          <h3>Grupo</h3>
          <TextField label="Titulo" value={group.label} onChange={(label) => controller.updateGroup(group.id, { label })} />
          <NumberField label="X" value={group.x} onChange={(x) => controller.updateGroup(group.id, { x })} />
          <NumberField label="Y" value={group.y} onChange={(y) => controller.updateGroup(group.id, { y })} />
          <NumberField label="Largura" value={group.width} onChange={(width) => controller.resizeGroup(group.id, width, group.height)} />
          <NumberField label="Altura" value={group.height} onChange={(height) => controller.resizeGroup(group.id, group.width, height)} />
          <ColorField label="Fundo" value={group.backgroundColor} onChange={(backgroundColor) => controller.updateGroup(group.id, { backgroundColor })} />
          <ColorField label="Borda" value={group.borderColor} onChange={(borderColor) => controller.updateGroup(group.id, { borderColor })} />
          <RangeField label="Opacidade" value={group.opacity} min={0.02} max={0.8} step={0.02} onChange={(opacity) => controller.updateGroup(group.id, { opacity })} />
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={() => controller.sendGroupBackward(group.id)}>
              <Minus size={16} />
              Enviar tras
            </button>
            <button type="button" className="secondary-button" onClick={() => controller.bringGroupForward(group.id)}>
              <Plus size={16} />
              Trazer frente
            </button>
          </div>
          <div className="table-checklist">
            {controller.diagram.tables.map((tableItem) => {
              const checked = group.tables.includes(tableItem.id);
              return (
                <label key={tableItem.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      controller.updateGroup(group.id, {
                        tables: event.target.checked
                          ? [...group.tables, tableItem.id]
                          : group.tables.filter((id) => id !== tableItem.id),
                      });
                    }}
                  />
                  <span>{tableItem.name}</span>
                </label>
              );
            })}
          </div>
        </section>
      )}
    </aside>
  );
}

function TableColumnsEditor({ controller, table }: { controller: DiagramController; table: TableModel }) {
  const relationBackedForeignKeys = new Set(
    controller.diagram.relations
      .filter((relation) => relation.fromTable === table.id)
      .map((relation) => relation.fromColumn),
  );

  return (
    <div className="columns-editor">
      <div className="subsection-heading">
        <h4>Campos</h4>
        <button type="button" className="icon-button" onClick={() => controller.addColumn(table.id)} title="Adicionar campo">
          <Plus size={15} />
        </button>
      </div>
      <div className="columns-list">
        {table.columns.map((column) => (
          <ColumnEditor
            key={column.id}
            column={column}
            relationBackedFk={relationBackedForeignKeys.has(column.name)}
            onChange={(patch) => controller.updateColumn(table.id, column.id, patch)}
            onRemove={() => controller.removeColumn(table.id, column.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ColumnEditor({
  column,
  relationBackedFk,
  onChange,
  onRemove,
}: {
  column: ColumnModel;
  relationBackedFk: boolean;
  onChange: (patch: Partial<ColumnModel>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="column-editor">
      <input
        type="text"
        value={column.name}
        aria-label="Nome do campo"
        onChange={(event) => onChange({ name: event.target.value })}
      />
      <input
        type="text"
        value={column.type}
        aria-label="Tipo do campo"
        onChange={(event) => onChange({ type: event.target.value })}
      />
      <label className="mini-check" title="Primary key">
        <input
          type="checkbox"
          checked={column.primaryKey}
          onChange={(event) => onChange({ primaryKey: event.target.checked })}
        />
        <span>PK</span>
      </label>
      <label className="mini-check" title={relationBackedFk ? "FK definido por uma relacao" : "Foreign key"}>
        <input
          type="checkbox"
          checked={column.foreignKey}
          disabled={relationBackedFk}
          onChange={(event) => onChange({ foreignKey: event.target.checked })}
        />
        <span>FK</span>
      </label>
      <label className="mini-check" title="Not null">
        <input
          type="checkbox"
          checked={!column.nullable}
          onChange={(event) => onChange({ nullable: !event.target.checked })}
        />
        <span>NN</span>
      </label>
      <label className="mini-check" title="Unique">
        <input
          type="checkbox"
          checked={Boolean(column.unique)}
          onChange={(event) => onChange({ unique: event.target.checked })}
        />
        <span>UQ</span>
      </label>
      <button type="button" className="icon-button" onClick={onRemove} title="Remover campo">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function RelationProperties({ controller, relationId }: { controller: DiagramController; relationId: string }) {
  const relation = controller.diagram.relations.find((item) => item.id === relationId);
  if (!relation) return null;
  const tableMap = new Map(controller.diagram.tables.map((table) => [table.id, table]));
  const fromTable = tableMap.get(relation.fromTable);
  const toTable = tableMap.get(relation.toTable);

  const addCenteredPoint = () => {
    if (!fromTable || !toTable) return;
    controller.addViaPoint(
      relation.id,
      snapPoint(
        getRelationGeometry(relation, fromTable, toTable).labelPoint,
        controller.snapToGrid,
        controller.diagram.visual.gridSize,
      ),
    );
  };

  return (
    <section className="property-section">
      <h3>Linha</h3>
      <TextField label="Rotulo" value={relation.label} onChange={(label) => controller.updateRelation(relation.id, { label })} />
      <ColorField label="Cor" value={relation.color} onChange={(color) => controller.updateRelation(relation.id, { color })} />
      <NumberField label="Espessura" value={relation.strokeWidth} onChange={(strokeWidth) => controller.updateRelation(relation.id, { strokeWidth })} />
      <RangeField label="Opacidade" value={relation.opacity} min={0.1} max={1} step={0.05} onChange={(opacity) => controller.updateRelation(relation.id, { opacity })} />
      <SelectField<LineStyle>
        label="Estilo"
        value={relation.style}
        options={["solid", "dashed", "dotted", "rounded"]}
        onChange={(style) => controller.updateRelation(relation.id, { style })}
      />
      <SelectField<LineRoute>
        label="Rota"
        value={relation.route}
        options={["straight", "orthogonal", "curve"]}
        onChange={(route) => controller.updateRelation(relation.id, { route })}
      />
      <SelectField<Direction>
        label="Origem"
        value={relation.fromSide}
        options={["north", "south", "east", "west"]}
        onChange={(fromSide) => controller.updateRelation(relation.id, {
          fromSide,
          startOffsetX: 0,
          startOffsetY: 0,
        })}
      />
      <SelectField<Direction>
        label="Destino"
        value={relation.toSide}
        options={["north", "south", "east", "west"]}
        onChange={(toSide) => controller.updateRelation(relation.id, {
          toSide,
          endOffsetX: 0,
          endOffsetY: 0,
        })}
      />
      <div className="button-row">
        <button type="button" className="secondary-button" onClick={addCenteredPoint}>
          <Plus size={16} />
          Ponto
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!relation.viaPoints.length}
          onClick={() => controller.removeViaPoint(relation.id, relation.viaPoints.length - 1)}
        >
          <Trash2 size={16} />
          Ultimo
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => controller.resetRelation(relation.id)}
        >
          <RotateCcw size={16} />
          Reset
        </button>
      </div>
      {relation.viaPoints.map((point, index) => (
        <PointEditor
          key={`${relation.id}-point-${index}`}
          point={point}
          label={`P${index + 1}`}
          onChange={(next) => controller.updateViaPoint(relation.id, index, next)}
          onRemove={() => controller.removeViaPoint(relation.id, index)}
        />
      ))}
    </section>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(value.toFixed(1))}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <span className="color-control">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <span className="range-control">
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output>{value.toFixed(2)}</output>
      </span>
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  labels?: Partial<Record<T, string>>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function PointEditor({
  label,
  point,
  onChange,
  onRemove,
}: {
  label: string;
  point: Point;
  onChange: (point: Point) => void;
  onRemove: () => void;
}) {
  return (
    <div className="point-editor">
      <span>{label}</span>
      <input type="number" value={Number(point.x.toFixed(1))} onChange={(event) => onChange({ ...point, x: Number(event.target.value) })} />
      <input type="number" value={Number(point.y.toFixed(1))} onChange={(event) => onChange({ ...point, y: Number(event.target.value) })} />
      <button type="button" className="icon-button" onClick={onRemove} title="Remover ponto">
        <Trash2 size={15} />
      </button>
    </div>
  );
}
