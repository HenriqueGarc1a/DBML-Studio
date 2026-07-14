import type { DiagramModel, GroupModel, RelationModel, Selection, TableModel } from "../model/types";

/** Renderer-facing port. The SVG layer depends only on domain models and these actions. */
export interface DiagramCanvasController {
  diagram: DiagramModel;
  selected?: Selection;
  snapToGrid: boolean;
  canUndo: boolean;
  canRedo: boolean;
  setSelected(selection: Selection | undefined): void;
  setSnapToGrid(value: boolean): void;
  undo(): void;
  redo(): void;
  beginHistoryBatch(): void;
  endHistoryBatch(): void;
  addTable(): void;
  updateTable(id: string, patch: Partial<TableModel>): void;
  moveTables(items: Array<{ id: string; x: number; y: number }>): void;
  settleTable(id: string): void;
  addRelation(fromTableId: string, fromColumn: string, toTableId: string, toColumn: string): void;
  updateRelation(id: string, patch: Partial<RelationModel>): void;
  tidyRelations(): void;
  addGroup(): void;
  updateGroup(id: string, patch: Partial<GroupModel>): void;
  applyAutoLayout(): Promise<DiagramModel>;
}
