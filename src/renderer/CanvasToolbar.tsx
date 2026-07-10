import { FolderPlus, GripVertical, Link2, Magnet, Maximize2, Redo2, Route, Sparkles, Table2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { PointerEvent, ReactNode } from "react";
import type { Point } from "../model/types";

interface CanvasToolbarProps {
  position: Point; dragging: boolean; relationMode: boolean; choosingTarget: boolean; snapToGrid: boolean;
  canUndo: boolean; canRedo: boolean; hasRelations: boolean; canAutoLayout: boolean;
  onDragStart(event: PointerEvent<HTMLButtonElement>): void; onDrag(event: PointerEvent<HTMLButtonElement>): void; onDragEnd(event: PointerEvent<HTMLButtonElement>): void;
  onUndo(): void; onRedo(): void; onAddTable(): void; onAddGroup(): void; onToggleRelation(): void; onTidy(): void;
  onAutoLayout(): void; onToggleSnap(): void; onZoomOut(): void; onZoomIn(): void; onFit(): void;
}

export function CanvasToolbar(props: CanvasToolbarProps) {
  return <div className={`zoom-controls${props.dragging ? " is-dragging" : ""}`} style={{ left: props.position.x, top: props.position.y }} aria-label="Zoom">
    <button type="button" className="zoom-drag-handle icon-button" title="Mover controles" onPointerDown={props.onDragStart} onPointerMove={props.onDrag} onPointerUp={props.onDragEnd} onPointerCancel={props.onDragEnd}><GripVertical size={15} /></button>
    <div className="floating-toolbar-grid" aria-label="Ferramentas do diagrama">
      <Tool title="Desfazer" onClick={props.onUndo} disabled={!props.canUndo}><Undo2 size={16} /></Tool>
      <Tool title="Refazer" onClick={props.onRedo} disabled={!props.canRedo}><Redo2 size={16} /></Tool>
      <Tool title="Nova tabela" onClick={props.onAddTable}><Table2 size={16} /></Tool>
      <Tool title="Novo grupo" onClick={props.onAddGroup}><FolderPlus size={16} /></Tool>
      <Tool title={props.choosingTarget ? "Campo destino da relação" : "Nova relação"} active={props.relationMode} onClick={props.onToggleRelation}><Link2 size={16} /></Tool>
      <Tool title="Organizar relações" onClick={props.onTidy} disabled={!props.hasRelations}><Route size={16} /></Tool>
      <Tool title="Auto-arrumar minimizando cruzamentos" onClick={props.onAutoLayout} disabled={!props.canAutoLayout}><Sparkles size={16} /></Tool>
      <Tool title="Snap no grid" active={props.snapToGrid} onClick={props.onToggleSnap}><Magnet size={16} /></Tool>
      <Tool title="Diminuir zoom" onClick={props.onZoomOut}><ZoomOut size={16} /></Tool>
      <Tool title="Aumentar zoom" onClick={props.onZoomIn}><ZoomIn size={16} /></Tool>
      <Tool title="Centralizar diagrama" onClick={props.onFit}><Maximize2 size={16} /></Tool>
    </div>
  </div>;
}

function Tool({ title, active, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick(): void; children: ReactNode }) {
  return <button type="button" className={`icon-button${active ? " is-toggle-active" : ""}`} title={title} aria-pressed={active} disabled={disabled} onClick={onClick}>{children}</button>;
}
