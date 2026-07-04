import { ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, Route, Trash2 } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import type { DiagramController } from "../editor/useDiagramController";
import { DIAGRAM_MAX_GRID_SIZE, DIAGRAM_MIN_GRID_SIZE } from "../model/defaults";
import type {
  BadgeKind,
  BadgeVisual,
  ColumnModel,
  Direction,
  LineStyle,
  Point,
  SavedColor,
  TableModel,
  TableVisual,
} from "../model/types";
import { getRelationGeometry } from "../utils/geometry";
import { snapPoint } from "../utils/grid";

interface PropertiesPanelProps {
  controller: DiagramController;
  collapsed: boolean;
  onToggle: () => void;
}

const PROPERTY_GROUP_STORAGE_PREFIX = "dbml-studio-property-group:";

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
  const savedColors = controller.diagram.visual.savedColors;

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
          <CollapsibleGroup id="diagram.canvas" title="Canvas">
            <ColorField
              label="Fundo"
              value={controller.diagram.visual.backgroundColor}
              savedColors={savedColors}
              onChange={(backgroundColor) => controller.updateDiagramVisual({ backgroundColor })}
            />
            <ColorField
              label="Cor do grid"
              value={controller.diagram.visual.gridColor}
              savedColors={savedColors}
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
          </CollapsibleGroup>
          <DefaultTableStyleEditor controller={controller} savedColors={savedColors} />
          <BadgeColorsEditor controller={controller} savedColors={savedColors} />
          <SavedColorsEditor
            colors={savedColors}
            onChange={(savedColors) => controller.updateDiagramVisual({ savedColors })}
          />
        </section>
      )}
      {!collapsed && table && (
        <section className="property-section">
          <h3>Tabela</h3>
          <CollapsibleGroup id="table.general" title="Geral">
            <TextField label="Nome" value={table.name} onChange={(name) => controller.updateTable(table.id, { name })} />
          </CollapsibleGroup>
          <CollapsibleGroup id="table.layout" title="Layout">
            <NumberField label="X" value={table.x} onChange={(x) => controller.updateTable(table.id, { x })} />
            <NumberField label="Y" value={table.y} onChange={(y) => controller.updateTable(table.id, { y })} />
            <NumberField label="Largura" value={table.width} onChange={(width) => controller.resizeTable(table.id, width)} />
          </CollapsibleGroup>
          <CollapsibleGroup id="table.style" title="Estilo" defaultOpen={false}>
            <CheckboxField
              label="Padrão"
              checked={table.usesDefaultStyle}
              onChange={(usesDefaultStyle) => {
                controller.updateTable(table.id, {
                  usesDefaultStyle,
                  usesGroupStyle: usesDefaultStyle ? false : table.usesGroupStyle,
                  visual: usesDefaultStyle
                    ? table.visual
                    : { ...getEffectiveTableVisual(table, controller.diagram.visual.defaultTable) },
                });
              }}
            />
            <CheckboxField
              label="Grupo"
              checked={table.usesGroupStyle}
              onChange={(usesGroupStyle) => {
                controller.updateTable(table.id, {
                  usesGroupStyle,
                  usesDefaultStyle: usesGroupStyle ? false : table.usesDefaultStyle,
                });
              }}
            />
            {!table.usesDefaultStyle && !table.usesGroupStyle && (
              <TableVisualFields
                visual={table.visual}
                savedColors={savedColors}
                onChange={(visual) => controller.updateTable(table.id, { visual })}
              />
            )}
          </CollapsibleGroup>
          <TableColumnsEditor controller={controller} table={table} />
          <CollapsibleGroup id="table.actions" title="Ações" defaultOpen={false}>
            <div className="button-row">
              <button type="button" className="secondary-button danger-action" onClick={() => controller.removeTable(table.id)}>
                <Trash2 size={16} />
                Excluir tabela
              </button>
            </div>
          </CollapsibleGroup>
        </section>
      )}
      {!collapsed && relation && (
        <RelationProperties controller={controller} relationId={relation.id} />
      )}
      {!collapsed && group && (
        <section className="property-section">
          <h3>Grupo</h3>
          <CollapsibleGroup id="group.general" title="Geral">
            <TextField label="Título" value={group.label} onChange={(label) => controller.updateGroup(group.id, { label })} />
          </CollapsibleGroup>
          <CollapsibleGroup id="group.layout" title="Layout">
            <NumberField label="X" value={group.x} onChange={(x) => controller.updateGroup(group.id, { x })} />
            <NumberField label="Y" value={group.y} onChange={(y) => controller.updateGroup(group.id, { y })} />
            <NumberField label="Largura" value={group.width} onChange={(width) => controller.resizeGroup(group.id, width, group.height)} />
            <NumberField label="Altura" value={group.height} onChange={(height) => controller.resizeGroup(group.id, group.width, height)} />
          </CollapsibleGroup>
          <CollapsibleGroup id="group.style" title="Estilo" defaultOpen={false}>
            <ColorField
              label="Fundo"
              value={group.backgroundColor}
              savedColors={savedColors}
              onChange={(backgroundColor) => controller.updateGroup(group.id, { backgroundColor })}
            />
            <ColorField
              label="Borda"
              value={group.borderColor}
              savedColors={savedColors}
              onChange={(borderColor) => controller.updateGroup(group.id, { borderColor })}
            />
            <RangeField label="Opacidade" value={group.opacity} min={0.02} max={0.8} step={0.02} onChange={(opacity) => controller.updateGroup(group.id, { opacity })} />
            <div className="subsection-heading compact-heading">
              <h4>Estilo das tabelas</h4>
            </div>
            <TableVisualFields
              visual={group.tableVisual}
              savedColors={savedColors}
              onChange={(tableVisual) => controller.updateGroup(group.id, { tableVisual })}
            />
          </CollapsibleGroup>
          <CollapsibleGroup id="group.actions" title="Ações" defaultOpen={false}>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={() => controller.sendGroupBackward(group.id)}>
                <Minus size={16} />
                Enviar atrás
              </button>
              <button type="button" className="secondary-button" onClick={() => controller.bringGroupForward(group.id)}>
                <Plus size={16} />
                Trazer frente
              </button>
            </div>
            <div className="button-row">
              <button type="button" className="secondary-button danger-action" onClick={() => controller.removeGroup(group.id)}>
                <Trash2 size={16} />
                Excluir grupo
              </button>
            </div>
          </CollapsibleGroup>
        </section>
      )}
    </aside>
  );
}

function CollapsibleGroup({
  id,
  title,
  defaultOpen = true,
  actions,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [storedOpen, setStoredOpen] = useState(() => ({
    id,
    open: readStoredGroupOpen(id, defaultOpen),
  }));
  const open = storedOpen.id === id ? storedOpen.open : readStoredGroupOpen(id, defaultOpen);
  const setOpen = (updater: boolean | ((current: boolean) => boolean)) => {
    const nextOpen = typeof updater === "function" ? updater(open) : updater;
    setStoredOpen({ id, open: nextOpen });
  };

  useEffect(() => {
    try {
      localStorage.setItem(`${PROPERTY_GROUP_STORAGE_PREFIX}${id}`, open ? "open" : "closed");
    } catch {
      // localStorage may be unavailable in restricted browser contexts.
    }
  }, [id, open]);

  return (
    <div className={`property-group${open ? " is-open" : ""}`}>
      <div className="property-group-heading">
        <button
          type="button"
          className="property-group-toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span>{title}</span>
        </button>
        {actions && open && <div className="property-group-actions">{actions}</div>}
      </div>
      {open && <div className="property-group-body">{children}</div>}
    </div>
  );
}

function DefaultTableStyleEditor({
  controller,
  savedColors,
}: {
  controller: DiagramController;
  savedColors: SavedColor[];
}) {
  const visual = controller.diagram.visual.defaultTable;

  return (
    <CollapsibleGroup id="diagram.defaultTable" title="Tabela padrão" defaultOpen={false}>
      <TableVisualFields
        visual={visual}
        savedColors={savedColors}
        onChange={(defaultTable) => controller.updateDiagramVisual({ defaultTable })}
      />
    </CollapsibleGroup>
  );
}

function TableVisualFields({
  visual,
  savedColors,
  onChange,
}: {
  visual: TableVisual;
  savedColors: SavedColor[];
  onChange: (visual: TableVisual) => void;
}) {
  return (
    <>
      <ColorField
        label="Fundo"
        value={visual.backgroundColor}
        savedColors={savedColors}
        onChange={(backgroundColor) => onChange({ ...visual, backgroundColor })}
      />
      <ColorField
        label="Borda"
        value={visual.borderColor}
        savedColors={savedColors}
        onChange={(borderColor) => onChange({ ...visual, borderColor })}
      />
      <ColorField
        label="Cabeçalho"
        value={visual.headerColor}
        savedColors={savedColors}
        onChange={(headerColor) => onChange({ ...visual, headerColor })}
      />
      <ColorField
        label="Texto"
        value={visual.textColor}
        savedColors={savedColors}
        onChange={(textColor) => onChange({ ...visual, textColor })}
      />
      <RangeField
        label="Opacidade"
        value={visual.opacity}
        min={0.1}
        max={1}
        step={0.05}
        onChange={(opacity) => onChange({ ...visual, opacity })}
      />
    </>
  );
}

function BadgeColorsEditor({
  controller,
  savedColors,
}: {
  controller: DiagramController;
  savedColors: SavedColor[];
}) {
  const badges = controller.diagram.visual.badges;

  const updateBadge = (kind: BadgeKind, patch: Partial<BadgeVisual>) => {
    controller.updateDiagramVisual({
      badges: {
        ...badges,
        [kind]: { ...badges[kind], ...patch },
      },
    });
  };

  return (
    <CollapsibleGroup id="diagram.badges" title="Badges" defaultOpen={false}>
      <BadgeVisualFields
        label="PK"
        visual={badges.primaryKey}
        savedColors={savedColors}
        onChange={(patch) => updateBadge("primaryKey", patch)}
      />
      <BadgeVisualFields
        label="FK"
        visual={badges.foreignKey}
        savedColors={savedColors}
        onChange={(patch) => updateBadge("foreignKey", patch)}
      />
      <BadgeVisualFields
        label="NN"
        visual={badges.notNull}
        savedColors={savedColors}
        onChange={(patch) => updateBadge("notNull", patch)}
      />
      <BadgeVisualFields
        label="UQ"
        visual={badges.unique}
        savedColors={savedColors}
        onChange={(patch) => updateBadge("unique", patch)}
      />
    </CollapsibleGroup>
  );
}

function BadgeVisualFields({
  label,
  visual,
  savedColors,
  onChange,
}: {
  label: string;
  visual: BadgeVisual;
  savedColors: SavedColor[];
  onChange: (patch: Partial<BadgeVisual>) => void;
}) {
  return (
    <div className="badge-color-editor">
      <span>{label}</span>
      <ColorField
        label="Fundo"
        value={visual.backgroundColor}
        savedColors={savedColors}
        onChange={(backgroundColor) => onChange({ backgroundColor })}
      />
      <ColorField
        label="Borda"
        value={visual.borderColor}
        savedColors={savedColors}
        onChange={(borderColor) => onChange({ borderColor })}
      />
      <ColorField
        label="Texto"
        value={visual.textColor}
        savedColors={savedColors}
        onChange={(textColor) => onChange({ textColor })}
      />
    </div>
  );
}

function SavedColorsEditor({
  colors,
  onChange,
}: {
  colors: SavedColor[];
  onChange: (colors: SavedColor[]) => void;
}) {
  const [draftName, setDraftName] = useState("Cor");
  const [draftColor, setDraftColor] = useState(colors[0]?.color ?? "#2dd4bf");

  const addColor = () => {
    if (!isHexColor(draftColor)) return;
    const name = draftName.trim() || `Cor ${colors.length + 1}`;
    const exists = colors.some(
      (item) => item.name.toLowerCase() === name.toLowerCase() && item.color.toLowerCase() === draftColor.toLowerCase(),
    );
    if (!exists) {
      onChange([...colors, { name, color: draftColor }]);
    }
  };

  return (
    <CollapsibleGroup
      id="diagram.savedColors"
      title="Cores salvas"
      defaultOpen={false}
      actions={
        <button type="button" className="icon-button" onClick={addColor} title="Salvar cor">
          <Plus size={15} />
        </button>
      }
    >
      <div className="saved-color-editor">
        <input
          type="text"
          value={draftName}
          aria-label="Nome da cor"
          onChange={(event) => setDraftName(event.target.value)}
        />
        <span className="color-control">
          <input type="color" value={isHexColor(draftColor) ? draftColor : "#2dd4bf"} onChange={(event) => setDraftColor(event.target.value)} />
          <input type="text" value={draftColor} onChange={(event) => setDraftColor(event.target.value)} />
        </span>
      </div>
      <div className="saved-color-list">
        {colors.map((item, index) => (
          <div key={`${item.name}-${item.color}-${index}`} className="saved-color-row">
            <span className="saved-color-chip" style={{ backgroundColor: item.color }} />
            <input
              type="text"
              value={item.name}
              aria-label="Nome salvo"
              onChange={(event) => {
                onChange(colors.map((color, colorIndex) =>
                  colorIndex === index ? { ...color, name: event.target.value } : color,
                ));
              }}
            />
            <input
              type="color"
              value={isHexColor(item.color) ? item.color : "#000000"}
              aria-label="Cor salva"
              title={item.color}
              onChange={(event) => {
                onChange(colors.map((color, colorIndex) =>
                  colorIndex === index ? { ...color, color: event.target.value } : color,
                ));
              }}
            />
            <button
              type="button"
              className="icon-button"
              title={`Remover ${item.name}`}
              onClick={() => onChange(colors.filter((_, colorIndex) => colorIndex !== index))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </CollapsibleGroup>
  );
}

function TableColumnsEditor({ controller, table }: { controller: DiagramController; table: TableModel }) {
  const relationBackedForeignKeys = new Set(
    controller.diagram.relations
      .filter((relation) => relation.fromTable === table.id)
      .map((relation) => relation.fromColumn),
  );

  return (
    <CollapsibleGroup
      id="table.columns"
      title="Campos"
      actions={
        <button type="button" className="icon-button" onClick={() => controller.addColumn(table.id)} title="Adicionar campo">
          <Plus size={15} />
        </button>
      }
    >
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
    </CollapsibleGroup>
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
      <label className="mini-check" title={relationBackedFk ? "FK definido por uma relação" : "Foreign key"}>
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
      <CollapsibleGroup id="relation.general" title="Geral">
        <TextField label="Rótulo" value={relation.label} onChange={(label) => controller.updateRelation(relation.id, { label })} />
        <ColorField
          label="Cor"
          value={relation.color}
          savedColors={controller.diagram.visual.savedColors}
          onChange={(color) => controller.updateRelation(relation.id, { color })}
        />
        <NumberField label="Espessura" value={relation.strokeWidth} onChange={(strokeWidth) => controller.updateRelation(relation.id, { strokeWidth })} />
        <RangeField label="Opacidade" value={relation.opacity} min={0.1} max={1} step={0.05} onChange={(opacity) => controller.updateRelation(relation.id, { opacity })} />
      </CollapsibleGroup>
      <CollapsibleGroup id="relation.route" title="Rota" defaultOpen={false}>
        <SelectField<LineStyle>
          label="Estilo"
          value={relation.style}
          options={["solid", "dashed", "dotted"]}
          labels={{ solid: "Sólida", dashed: "Tracejada", dotted: "Pontilhada" }}
          onChange={(style) => controller.updateRelation(relation.id, { style })}
        />
        <SelectField<Direction>
          label="Origem"
          value={relation.fromSide === "west" ? "west" : "east"}
          options={["west", "east"]}
          labels={{ east: "Direita", west: "Esquerda" }}
          onChange={(fromSide) => controller.updateRelation(relation.id, {
            fromSide,
            startOffsetX: 0,
            startOffsetY: 0,
          })}
        />
        <SelectField<Direction>
          label="Destino"
          value={relation.toSide === "west" ? "west" : "east"}
          options={["west", "east"]}
          labels={{ east: "Direita", west: "Esquerda" }}
          onChange={(toSide) => controller.updateRelation(relation.id, {
            toSide,
            endOffsetX: 0,
            endOffsetY: 0,
          })}
        />
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={() => controller.tidyRelation(relation.id)}>
            <Route size={16} />
            Auto rota
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
      </CollapsibleGroup>
      <CollapsibleGroup id="relation.points" title="Pontos" defaultOpen={false}>
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
            Último
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
      </CollapsibleGroup>
      <CollapsibleGroup id="relation.actions" title="Ações" defaultOpen={false}>
        <div className="button-row">
          <button type="button" className="secondary-button danger-action" onClick={() => controller.removeRelation(relation.id)}>
            <Trash2 size={16} />
            Excluir relação
          </button>
        </div>
      </CollapsibleGroup>
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

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ColorField({
  label,
  value,
  savedColors = [],
  onChange,
}: {
  label: string;
  value: string;
  savedColors?: SavedColor[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-row color-field-row">
      <span>{label}</span>
      <span className="color-control">
        <input type="color" value={isHexColor(value) ? value : "#000000"} onChange={(event) => onChange(event.target.value)} />
        <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
        <select
          value=""
          aria-label={`Cores salvas ${label}`}
          disabled={!savedColors.length}
          onChange={(event) => {
            if (event.target.value) {
              onChange(event.target.value);
            }
          }}
        >
          <option value="">{savedColors.length ? "Cores salvas" : "Sem cores salvas"}</option>
          {savedColors.map((item, index) => (
            <option key={`${item.name}-${item.color}-${index}`} value={item.color}>
              {item.name} - {item.color}
            </option>
          ))}
        </select>
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

function getEffectiveTableVisual(table: TableModel, defaultVisual: TableVisual): TableVisual {
  return table.usesDefaultStyle ? defaultVisual : table.visual;
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value);
}

function readStoredGroupOpen(id: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(`${PROPERTY_GROUP_STORAGE_PREFIX}${id}`);
    if (stored === "open") return true;
    if (stored === "closed") return false;
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }

  return fallback;
}
