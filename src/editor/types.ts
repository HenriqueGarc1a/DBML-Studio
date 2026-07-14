import type { ColumnModel, DiagramModel, EnumModel, GroupModel, Point, RelationModel, Selection, TableModel } from "../model/types";
import type { SavedDiagram, TrashedDiagram } from "./diagramLibrary";
import type { DiagramSnapshot, SnapshotReason } from "./diagramSnapshots";

export type DiagramSaveStatus = "saved" | "dirty" | "saving" | "local" | "error";

export interface DiagramController {
  dbmlText: string; diagram: DiagramModel; diagrams: SavedDiagram[]; trashedDiagrams: TrashedDiagram[]; activeDiagramId: string;
  diagramName: string; diagramFilename: string; selected?: Selection; exportedDbml: string; exportedTikz: string;
  snapToGrid: boolean; saveMessage: string; dbmlError?: string; canUndo: boolean; canRedo: boolean; diagramReady: boolean; libraryReady: boolean;
  saveStatus: DiagramSaveStatus; lastSavedAt?: number; snapshots: DiagramSnapshot[];
  setDbmlText(value: string): void; setSelected(value: Selection | undefined): void; setSnapToGrid(value: boolean): void;
  undo(): void; redo(): void; beginHistoryBatch(): void; endHistoryBatch(): void; setDiagramName(value: string): void;
  renameSavedDiagram(id: string, value: string): Promise<boolean>; deleteDiagram(id: string): Promise<boolean>;
  createDiagram(): Promise<string>; createDiagramFromSql(sql: string): Promise<string>; importDiagramDbml(filename: string, dbml: string): Promise<string>; importProjectBundle(source: string): Promise<string>; duplicateDiagram(id: string): Promise<string>; restoreDiagram(id: string): Promise<string | undefined>; purgeTrashedDiagram(id: string): void; openDiagram(id: string): Promise<void>;
  saveWiki(id: string, markdown: string, document?: string): Promise<boolean>;
  createSnapshot(reason?: SnapshotReason): void; restoreSnapshot(id: string): Promise<boolean>; deleteSnapshot(id: string): void;
  applyAutoLayout(): Promise<DiagramModel>; saveLayoutToEditor(previewDataUrl?: string): Promise<string>;
  updateDiagramVisual(patch: Partial<DiagramModel["visual"]>): void;
  addEnum(): void; updateEnum(id: string, patch: Partial<EnumModel>): void; removeEnum(id: string): void;
  addTable(): void; updateTable(id: string, patch: Partial<TableModel>): void; moveTable(id: string, dx: number, dy: number): void;
  moveTables(items: Array<{ id: string; x: number; y: number }>): void;
  resizeTable(id: string, width: number): void; settleTable(id: string): void; removeTable(id: string): void;
  addColumn(tableId: string): void; updateColumn(tableId: string, columnId: string, patch: Partial<ColumnModel>): void; removeColumn(tableId: string, columnId: string): void;
  addRelation(fromTableId: string, fromColumn: string, toTableId: string, toColumn: string): void; removeRelation(id: string): void;
  updateRelation(id: string, patch: Partial<RelationModel>): void; tidyRelation(id: string): void; tidyRelations(): void; resetRelation(id: string): void;
  addViaPoint(id: string, point: Point): void; insertViaPoint(id: string, point: Point): void; updateViaPoint(id: string, index: number, point: Point): void; removeViaPoint(id: string, index: number): void;
  updateGroup(id: string, patch: Partial<GroupModel>): void; moveGroup(id: string, dx: number, dy: number): void; resizeGroup(id: string, width: number, height: number): void;
  addGroup(): void; removeGroup(id: string): void; sendGroupBackward(id: string): void; bringGroupForward(id: string): void;
}
