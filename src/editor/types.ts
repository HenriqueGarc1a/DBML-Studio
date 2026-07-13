import type { ColumnModel, DiagramModel, GroupModel, Point, RelationModel, Selection, TableModel } from "../model/types";
import type { SavedDiagram } from "./diagramLibrary";

export interface DiagramController {
  dbmlText: string; diagram: DiagramModel; diagrams: SavedDiagram[]; activeDiagramId: string;
  diagramName: string; diagramFilename: string; selected?: Selection; exportedDbml: string; exportedTikz: string;
  snapToGrid: boolean; saveMessage: string; dbmlError?: string; canUndo: boolean; canRedo: boolean; diagramReady: boolean; libraryReady: boolean;
  setDbmlText(value: string): void; setSelected(value: Selection | undefined): void; setSnapToGrid(value: boolean): void;
  undo(): void; redo(): void; beginHistoryBatch(): void; endHistoryBatch(): void; setDiagramName(value: string): void;
  renameSavedDiagram(id: string, value: string): Promise<boolean>; deleteDiagram(id: string): Promise<boolean>;
  createDiagram(): Promise<string>; createDiagramFromSql(sql: string): Promise<string>; openDiagram(id: string): Promise<void>;
  saveWiki(id: string, markdown: string, document?: string): Promise<boolean>;
  applyAutoLayout(): Promise<DiagramModel>; saveLayoutToEditor(previewDataUrl?: string): Promise<string>;
  updateDiagramVisual(patch: Partial<DiagramModel["visual"]>): void;
  addTable(): void; updateTable(id: string, patch: Partial<TableModel>): void; moveTable(id: string, dx: number, dy: number): void;
  resizeTable(id: string, width: number): void; settleTable(id: string): void; removeTable(id: string): void;
  addColumn(tableId: string): void; updateColumn(tableId: string, columnId: string, patch: Partial<ColumnModel>): void; removeColumn(tableId: string, columnId: string): void;
  addRelation(fromTableId: string, fromColumn: string, toTableId: string, toColumn: string): void; removeRelation(id: string): void;
  updateRelation(id: string, patch: Partial<RelationModel>): void; tidyRelation(id: string): void; tidyRelations(): void; resetRelation(id: string): void;
  addViaPoint(id: string, point: Point): void; insertViaPoint(id: string, point: Point): void; updateViaPoint(id: string, index: number, point: Point): void; removeViaPoint(id: string, index: number): void;
  updateGroup(id: string, patch: Partial<GroupModel>): void; moveGroup(id: string, dx: number, dy: number): void; resizeGroup(id: string, width: number, height: number): void;
  addGroup(): void; removeGroup(id: string): void; sendGroupBackward(id: string): void; bringGroupForward(id: string): void;
}
