import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultDiagramVisual,
  defaultGroupVisual,
  defaultRelationVisual,
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
  getTableMinHeight,
  normalizeGridSize,
  TABLE_MIN_WIDTH,
} from "../model/defaults";
import type {
  ColumnModel,
  DiagramModel,
  GroupModel,
  Point,
  RelationModel,
  Selection,
  TableModel,
} from "../model/types";
import { exportDbml } from "../exporter/dbmlExporter";
import { parseDbml } from "../parser/dbmlParser";
import { makeId, uniqueId } from "../utils/id";
import { demoDbml } from "./demoDbml";

export interface DiagramController {
  dbmlText: string;
  diagram: DiagramModel;
  diagrams: SavedDiagram[];
  activeDiagramId: string;
  diagramName: string;
  selected: Selection | undefined;
  exportedDbml: string;
  exportedTikz: string;
  snapToGrid: boolean;
  saveMessage: string;
  dbmlError: string | undefined;
  canUndo: boolean;
  canRedo: boolean;
  setDbmlText: (value: string) => void;
  setSelected: (selection: Selection | undefined) => void;
  setSnapToGrid: (value: boolean) => void;
  undo: () => void;
  redo: () => void;
  beginHistoryBatch: () => void;
  endHistoryBatch: () => void;
  setDiagramName: (value: string) => void;
  createDiagram: () => Promise<void>;
  openDiagram: (id: string) => Promise<void>;
  deleteDiagram: () => Promise<void>;
  applyAutoLayout: () => Promise<void>;
  saveLayoutToEditor: () => Promise<void>;
  updateDiagramVisual: (patch: Partial<DiagramModel["visual"]>) => void;
  updateTable: (id: string, patch: Partial<TableModel>) => void;
  moveTable: (id: string, dx: number, dy: number) => void;
  resizeTable: (id: string, width: number, height: number) => void;
  addColumn: (tableId: string) => void;
  updateColumn: (tableId: string, columnId: string, patch: Partial<ColumnModel>) => void;
  removeColumn: (tableId: string, columnId: string) => void;
  updateRelation: (id: string, patch: Partial<RelationModel>) => void;
  resetRelation: (id: string) => void;
  addViaPoint: (id: string, point: Point) => void;
  updateViaPoint: (id: string, index: number, point: Point) => void;
  removeViaPoint: (id: string, index: number) => void;
  updateGroup: (id: string, patch: Partial<GroupModel>) => void;
  moveGroup: (id: string, dx: number, dy: number) => void;
  resizeGroup: (id: string, width: number, height: number) => void;
  addGroup: () => void;
  sendGroupBackward: (id: string) => void;
  bringGroupForward: (id: string) => void;
}

export interface SavedDiagram {
  id: string;
  name: string;
  dbml: string;
  updatedAt: number;
}

const emptyDiagram: DiagramModel = {
  id: "diagram-main",
  visual: { ...defaultDiagramVisual },
  tables: [],
  relations: [],
  groups: [],
  enums: [],
  source: "",
};

const LEGACY_SAVED_DBML_KEY = "dbml-studio-saved-dbml";
const DIAGRAMS_STORAGE_KEY = "dbml-studio-diagrams";
const ACTIVE_DIAGRAM_STORAGE_KEY = "dbml-studio-active-diagram-id";
const MAX_HISTORY_ENTRIES = 80;

interface DiagramHistory {
  past: DiagramModel[];
  future: DiagramModel[];
}

type DiagramChangeSource = "editor" | "ui" | "system";

interface DiagramLibrary {
  diagrams: SavedDiagram[];
  activeDiagramId: string;
  activeDiagram: SavedDiagram;
}

export function useDiagramController(): DiagramController {
  const initialLibraryRef = useRef<DiagramLibrary | undefined>();
  if (!initialLibraryRef.current) {
    initialLibraryRef.current = loadDiagramLibrary();
  }

  const initialLibrary = initialLibraryRef.current;
  const [diagrams, setDiagrams] = useState<SavedDiagram[]>(initialLibrary.diagrams);
  const [activeDiagramId, setActiveDiagramId] = useState(initialLibrary.activeDiagramId);
  const [diagramName, setDiagramNameState] = useState(initialLibrary.activeDiagram.name);
  const [dbmlText, setDbmlText] = useState(initialLibrary.activeDiagram.dbml);
  const [diagram, setDiagramState] = useState<DiagramModel>(emptyDiagram);
  const [selected, setSelected] = useState<Selection | undefined>();
  const [exportedDbml, setExportedDbml] = useState("");
  const [exportedTikz, setExportedTikz] = useState("");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");
  const [dbmlError, setDbmlError] = useState<string | undefined>();
  const [, setHistoryVersion] = useState(0);
  const diagramRef = useRef<DiagramModel>(emptyDiagram);
  const diagramsRef = useRef<SavedDiagram[]>(initialLibrary.diagrams);
  const activeDiagramIdRef = useRef(initialLibrary.activeDiagramId);
  const diagramNameRef = useRef(initialLibrary.activeDiagram.name);
  const historyRef = useRef<DiagramHistory>({ past: [], future: [] });
  const transactionStartRef = useRef<DiagramModel | undefined>();
  const diagramChangeSourceRef = useRef<DiagramChangeSource>("system");
  const initialRelationsRef = useRef(new Map<string, RelationModel>());
  const parseRevisionRef = useRef(0);
  const lastValidDbmlRef = useRef(initialLibrary.activeDiagram.dbml);

  const bumpHistoryVersion = useCallback(() => setHistoryVersion((version) => version + 1), []);

  const commitDiagramLibrary = useCallback((nextDiagrams: SavedDiagram[], nextActiveId: string) => {
    diagramsRef.current = nextDiagrams;
    activeDiagramIdRef.current = nextActiveId;
    setDiagrams(nextDiagrams);
    setActiveDiagramId(nextActiveId);
    writeDiagramLibrary(nextDiagrams, nextActiveId);
  }, []);

  const persistCurrentDiagram = useCallback((options: { silent?: boolean } = {}) => {
    const id = activeDiagramIdRef.current;
    const now = Date.now();
    const name = normalizeDiagramName(diagramNameRef.current);
    const dbml = exportDbml(diagramRef.current);
    let found = false;

    lastValidDbmlRef.current = dbml;
    const nextDiagrams = diagramsRef.current.map((item) => {
      if (item.id !== id) return item;
      found = true;
      return { ...item, name, dbml, updatedAt: now };
    });

    if (!found) {
      nextDiagrams.push({ id, name, dbml, updatedAt: now });
    }

    commitDiagramLibrary(nextDiagrams, id);
    localStorage.setItem(LEGACY_SAVED_DBML_KEY, dbml);

    if (!options.silent) {
      setSaveMessage(`Salvo ${new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    }
  }, [commitDiagramLibrary]);

  const pushHistory = useCallback((snapshot: DiagramModel) => {
    const history = historyRef.current;
    if (history.past[history.past.length - 1] === snapshot) return;

    history.past = [...history.past.slice(-(MAX_HISTORY_ENTRIES - 1)), snapshot];
    history.future = [];
    bumpHistoryVersion();
  }, [bumpHistoryVersion]);

  const replaceDiagram = useCallback((
    next: DiagramModel,
    options: {
      recordHistory?: boolean;
      resetHistory?: boolean;
      source?: DiagramChangeSource;
    } = {},
  ) => {
    const current = diagramRef.current;
    if (next === current) return;

    if (options.resetHistory) {
      historyRef.current = { past: [], future: [] };
      transactionStartRef.current = undefined;
      bumpHistoryVersion();
    } else if (options.recordHistory) {
      pushHistory(current);
    }

    diagramChangeSourceRef.current = options.source ?? "system";
    diagramRef.current = next;
    setDiagramState(next);
  }, [bumpHistoryVersion, pushHistory]);

  const updateDiagramState = useCallback((updater: (current: DiagramModel) => DiagramModel) => {
    const current = diagramRef.current;
    const next = updater(current);
    if (next === current) return;

    setSaveMessage("");

    if (!transactionStartRef.current) {
      pushHistory(current);
    }

    diagramChangeSourceRef.current = "ui";
    diagramRef.current = next;
    setDiagramState(next);
  }, [pushHistory]);

  const importDbmlText = useCallback(async (
    text: string,
    options: { resetHistory?: boolean } = {},
  ) => {
    const revision = parseRevisionRef.current + 1;
    parseRevisionRef.current = revision;

    try {
      const parsed = parseDbml(text);
      const { layoutDiagram } = await import("../layout/autoLayout");
      const laidOut = await layoutDiagram(parsed, { preserveManual: true });

      if (revision !== parseRevisionRef.current) return false;

      lastValidDbmlRef.current = text;
      initialRelationsRef.current = new Map(laidOut.relations.map((relation) => [relation.id, relation]));
      setDbmlError(undefined);
      replaceDiagram(laidOut, {
        resetHistory: options.resetHistory ?? true,
        source: "editor",
      });
      setSelected(undefined);
      return true;
    } catch (error) {
      if (revision === parseRevisionRef.current) {
        setDbmlError(formatDbmlError(error));
      }
      return false;
    }
  }, [replaceDiagram]);

  const updateDbmlText = useCallback((value: string) => {
    setDbmlText(value);
    setSaveMessage("");
    void importDbmlText(value, { resetHistory: true });
  }, [importDbmlText]);

  useEffect(() => {
    void importDbmlText(dbmlText);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function updateExports() {
      const { exportTikz } = await import("../exporter/tikzExporter");
      const nextDbml = exportDbml(diagram);

      if (!cancelled) {
        setExportedDbml(nextDbml);
        setExportedTikz(exportTikz(diagram));
        if (diagramChangeSourceRef.current === "ui") {
          lastValidDbmlRef.current = nextDbml;
          setDbmlText(nextDbml);
          setDbmlError(undefined);
        }
      }
    }

    void updateExports();

    return () => {
      cancelled = true;
    };
  }, [diagram]);


  const applyAutoLayout = useCallback(async () => {
    const { layoutDiagram } = await import("../layout/autoLayout");
    const laidOut = await layoutDiagram(diagramRef.current, { preserveManual: false });
    setSaveMessage("");
    replaceDiagram(laidOut, { recordHistory: true, source: "ui" });
  }, [replaceDiagram]);

  const saveLayoutToEditor = useCallback(async () => {
    const current = diagramRef.current;
    const nextDbml = exportDbml(current);
    setDbmlText(nextDbml);
    lastValidDbmlRef.current = nextDbml;
    setDbmlError(undefined);
    initialRelationsRef.current = new Map(current.relations.map((relation) => [relation.id, relation]));
    persistCurrentDiagram();
  }, [persistCurrentDiagram]);

  const renameDiagram = useCallback((value: string) => {
    diagramNameRef.current = value;
    setDiagramNameState(value);

    const id = activeDiagramIdRef.current;
    const name = normalizeDiagramName(value);
    const nextDiagrams = diagramsRef.current.map((item) =>
      item.id === id ? { ...item, name, updatedAt: Date.now() } : item,
    );

    commitDiagramLibrary(nextDiagrams, id);
    setSaveMessage("");
  }, [commitDiagramLibrary]);

  const openDiagram = useCallback(async (id: string) => {
    if (id === activeDiagramIdRef.current) return;

    persistCurrentDiagram({ silent: true });
    const record = diagramsRef.current.find((item) => item.id === id);
    if (!record) return;

    activeDiagramIdRef.current = record.id;
    diagramNameRef.current = record.name;
    setActiveDiagramId(record.id);
    setDiagramNameState(record.name);
    setDbmlText(record.dbml);
    lastValidDbmlRef.current = record.dbml;
    setDbmlError(undefined);
    setSaveMessage(`Aberto ${record.name}`);
    writeDiagramLibrary(diagramsRef.current, record.id);
    await importDbmlText(record.dbml, { resetHistory: true });
  }, [importDbmlText, persistCurrentDiagram]);

  const createDiagram = useCallback(async () => {
    persistCurrentDiagram({ silent: true });

    const id = uniqueId("diagram");
    const name = nextDiagramName(diagramsRef.current);
    const dbml = createBlankDiagramDbml();
    const now = Date.now();
    const record: SavedDiagram = { id, name, dbml, updatedAt: now };
    const nextDiagrams = [...diagramsRef.current, record];

    diagramNameRef.current = name;
    setDiagramNameState(name);
    setDbmlText(dbml);
    lastValidDbmlRef.current = dbml;
    setDbmlError(undefined);
    setSaveMessage(`Novo ${name}`);
    commitDiagramLibrary(nextDiagrams, id);
    await importDbmlText(dbml, { resetHistory: true });
  }, [commitDiagramLibrary, importDbmlText, persistCurrentDiagram]);

  const deleteDiagram = useCallback(async () => {
    const currentId = activeDiagramIdRef.current;
    const deletedName = normalizeDiagramName(diagramNameRef.current);
    const currentIndex = Math.max(0, diagramsRef.current.findIndex((item) => item.id === currentId));
    const remaining = diagramsRef.current.filter((item) => item.id !== currentId);
    const now = Date.now();
    const nextRecord = remaining[currentIndex] ?? remaining[currentIndex - 1] ?? {
      id: uniqueId("diagram"),
      name: "Diagrama 1",
      dbml: createBlankDiagramDbml(),
      updatedAt: now,
    };
    const nextDiagrams = remaining.length ? remaining : [nextRecord];

    diagramNameRef.current = nextRecord.name;
    setDiagramNameState(nextRecord.name);
    setDbmlText(nextRecord.dbml);
    lastValidDbmlRef.current = nextRecord.dbml;
    setDbmlError(undefined);
    setSaveMessage(`Excluido ${deletedName}`);
    localStorage.setItem(LEGACY_SAVED_DBML_KEY, nextRecord.dbml);
    commitDiagramLibrary(nextDiagrams, nextRecord.id);
    await importDbmlText(nextRecord.dbml, { resetHistory: true });
  }, [commitDiagramLibrary, importDbmlText]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      persistCurrentDiagram({ silent: true });
      setSaveMessage(`Autos salvo ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [persistCurrentDiagram]);

  useEffect(() => {
    const saveBeforeClose = () => persistCurrentDiagram({ silent: true });
    window.addEventListener("pagehide", saveBeforeClose);
    return () => window.removeEventListener("pagehide", saveBeforeClose);
  }, [persistCurrentDiagram]);

  const updateDiagramVisual = useCallback((patch: Partial<DiagramModel["visual"]>) => {
    updateDiagramState((current) => {
      const visual = { ...current.visual, ...patch };
      if (patch.gridSize !== undefined) {
        visual.gridSize = normalizeGridSize(patch.gridSize, current.visual.gridSize);
      }

      return { ...current, visual };
    });
  }, [updateDiagramState]);

  const updateTable = useCallback((id: string, patch: Partial<TableModel>) => {
    updateDiagramState((current) => ({
      ...current,
      tables: current.tables.map((table) =>
        table.id === id
          ? {
              ...table,
              ...patch,
              visual: { ...table.visual, ...(patch.visual ?? {}) },
              layoutSource: patch.x !== undefined || patch.y !== undefined ? "manual" : table.layoutSource,
            }
          : table,
      ),
    }));
  }, [updateDiagramState]);

  const moveTable = useCallback((id: string, dx: number, dy: number) => {
    const table = diagramRef.current.tables.find((item) => item.id === id);
    updateTable(id, {
      x: (table?.x ?? 0) + dx,
      y: (table?.y ?? 0) + dy,
      layoutSource: "manual",
    });
  }, [updateTable]);

  const resizeTable = useCallback((id: string, width: number, height: number) => {
    updateDiagramState((current) => ({
      ...current,
      tables: current.tables.map((table) =>
        table.id === id
          ? {
              ...table,
              width: Math.max(TABLE_MIN_WIDTH, width),
              height: Math.max(getTableMinHeight(table.columns.length), height),
              layoutSource: "manual",
            }
          : table,
      ),
    }));
  }, [updateDiagramState]);

  const addColumn = useCallback((tableId: string) => {
    updateDiagramState((current) => ({
      ...current,
      tables: current.tables.map((table) => {
        if (table.id !== tableId) return table;

        const nextName = nextColumnName(table.columns);
        const columns = [
          ...table.columns,
          createColumn(table.name, nextName, table.columns.length),
        ];

        return {
          ...table,
          columns,
          height: Math.max(table.height, getTableMinHeight(columns.length)),
          layoutSource: "manual",
        };
      }),
    }));
  }, [updateDiagramState]);

  const updateColumn = useCallback((tableId: string, columnId: string, patch: Partial<ColumnModel>) => {
    updateDiagramState((current) => {
      let previousName: string | undefined;
      let nextName: string | undefined;

      const tables = current.tables.map((table) => {
        if (table.id !== tableId) return table;

        return {
          ...table,
          columns: table.columns.map((column) => {
            if (column.id !== columnId) return column;

            previousName = column.name;
            const nextColumn = "foreignKey" in patch
              ? normalizeManualForeignKeySetting({ ...column, ...patch })
              : { ...column, ...patch };
            nextName = nextColumn.name;
            return nextColumn;
          }),
          layoutSource: "manual" as const,
        };
      });

      const renamedFrom = previousName;
      const renamedTo = nextName;

      if (!renamedFrom || !renamedTo || renamedFrom === renamedTo) {
        return { ...current, tables };
      }

      return {
        ...current,
        tables,
        relations: current.relations.map((relation) => ({
          ...relation,
          fromColumn: relation.fromTable === tableId && relation.fromColumn === renamedFrom
            ? renamedTo
            : relation.fromColumn,
          toColumn: relation.toTable === tableId && relation.toColumn === renamedFrom
            ? renamedTo
            : relation.toColumn,
        })),
      };
    });
  }, [updateDiagramState]);

  const removeColumn = useCallback((tableId: string, columnId: string) => {
    updateDiagramState((current) => {
      let removedName: string | undefined;

      const tables = current.tables.map((table) => {
        if (table.id !== tableId) return table;

        removedName = table.columns.find((column) => column.id === columnId)?.name;
        const columns = table.columns.filter((column) => column.id !== columnId);

        return {
          ...table,
          columns,
          height: Math.max(table.height, getTableMinHeight(columns.length)),
          layoutSource: "manual" as const,
        };
      });

      return {
        ...current,
        tables,
        relations: removedName
          ? current.relations.filter(
              (relation) =>
                !(relation.fromTable === tableId && relation.fromColumn === removedName) &&
                !(relation.toTable === tableId && relation.toColumn === removedName),
            )
          : current.relations,
      };
    });
  }, [updateDiagramState]);

  const updateRelation = useCallback((id: string, patch: Partial<RelationModel>) => {
    updateDiagramState((current) => ({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id ? { ...relation, ...patch } : relation,
      ),
    }));
  }, [updateDiagramState]);

  const resetRelation = useCallback((id: string) => {
    updateDiagramState((current) => ({
      ...current,
      relations: current.relations.map((relation) => {
        if (relation.id !== id) return relation;

        const initial = initialRelationsRef.current.get(id);
        return initial
          ? { ...initial }
          : {
              ...relation,
              ...defaultRelationVisual,
              fromSide: defaultRelationVisual.fromSide,
              toSide: defaultRelationVisual.toSide,
              startOffsetX: 0,
              startOffsetY: 0,
              endOffsetX: 0,
              endOffsetY: 0,
              viaPoints: [],
            };
      }),
    }));
  }, [updateDiagramState]);

  const addViaPoint = useCallback((id: string, point: Point) => {
    updateDiagramState((current) => ({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id ? { ...relation, viaPoints: [...relation.viaPoints, point] } : relation,
      ),
    }));
  }, [updateDiagramState]);

  const updateViaPoint = useCallback((id: string, index: number, point: Point) => {
    updateDiagramState((current) => ({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id
          ? {
              ...relation,
              viaPoints: relation.viaPoints.map((viaPoint, viaIndex) =>
                viaIndex === index ? point : viaPoint,
              ),
            }
          : relation,
      ),
    }));
  }, [updateDiagramState]);

  const removeViaPoint = useCallback((id: string, index: number) => {
    updateDiagramState((current) => ({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id
          ? { ...relation, viaPoints: relation.viaPoints.filter((_, viaIndex) => viaIndex !== index) }
          : relation,
      ),
    }));
  }, [updateDiagramState]);

  const updateGroup = useCallback((id: string, patch: Partial<GroupModel>) => {
    updateDiagramState((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
    }));
  }, [updateDiagramState]);

  const moveGroup = useCallback((id: string, dx: number, dy: number) => {
    updateDiagramState((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === id ? { ...group, x: group.x + dx, y: group.y + dy } : group,
      ),
    }));
  }, [updateDiagramState]);

  const resizeGroup = useCallback((id: string, width: number, height: number) => {
    updateGroup(id, {
      width: Math.max(GROUP_MIN_WIDTH, width),
      height: Math.max(GROUP_MIN_HEIGHT, height),
    });
  }, [updateGroup]);

  const addGroup = useCallback(() => {
    const id = uniqueId("group");
    const tableIds = selected?.type === "table" ? [selected.id] : [];
    const selectedTable = selected?.type === "table"
      ? diagram.tables.find((table) => table.id === selected.id)
      : undefined;

    const group: GroupModel = {
      id,
      label: "New Group",
      x: selectedTable ? selectedTable.x - 28 : 40,
      y: selectedTable ? selectedTable.y - 32 : 40,
      width: selectedTable ? selectedTable.width + 56 : 420,
      height: selectedTable ? selectedTable.height + 80 : 260,
      ...defaultGroupVisual,
      tables: tableIds,
    };

    updateDiagramState((current) => ({ ...current, groups: [...current.groups, group] }));
    setSelected({ type: "group", id });
  }, [diagram.tables, selected, updateDiagramState]);

  const sendGroupBackward = useCallback((id: string) => {
    updateDiagramState((current) => {
      const index = current.groups.findIndex((group) => group.id === id);
      if (index <= 0) return current;
      const groups = [...current.groups];
      const [group] = groups.splice(index, 1);
      groups.splice(index - 1, 0, group);
      return { ...current, groups };
    });
  }, [updateDiagramState]);

  const bringGroupForward = useCallback((id: string) => {
    updateDiagramState((current) => {
      const index = current.groups.findIndex((group) => group.id === id);
      if (index < 0 || index === current.groups.length - 1) return current;
      const groups = [...current.groups];
      const [group] = groups.splice(index, 1);
      groups.splice(index + 1, 0, group);
      return { ...current, groups };
    });
  }, [updateDiagramState]);

  const undo = useCallback(() => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return;

    history.future = [diagramRef.current, ...history.future.slice(0, MAX_HISTORY_ENTRIES - 1)];
    transactionStartRef.current = undefined;
    diagramChangeSourceRef.current = "ui";
    diagramRef.current = previous;
    setDiagramState(previous);
    setSelected(undefined);
    setSaveMessage("");
    bumpHistoryVersion();
  }, [bumpHistoryVersion]);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const next = history.future.shift();
    if (!next) return;

    history.past = [...history.past.slice(-(MAX_HISTORY_ENTRIES - 1)), diagramRef.current];
    transactionStartRef.current = undefined;
    diagramChangeSourceRef.current = "ui";
    diagramRef.current = next;
    setDiagramState(next);
    setSelected(undefined);
    setSaveMessage("");
    bumpHistoryVersion();
  }, [bumpHistoryVersion]);

  const beginHistoryBatch = useCallback(() => {
    if (!transactionStartRef.current) {
      transactionStartRef.current = diagramRef.current;
    }
  }, []);

  const endHistoryBatch = useCallback(() => {
    const start = transactionStartRef.current;
    transactionStartRef.current = undefined;

    if (start && start !== diagramRef.current) {
      pushHistory(start);
    }
  }, [pushHistory]);

  return {
    dbmlText,
    diagram,
    diagrams,
    activeDiagramId,
    diagramName,
    selected,
    exportedDbml,
    exportedTikz,
    snapToGrid,
    saveMessage,
    dbmlError,
    canUndo: historyRef.current.past.length > 0,
    canRedo: historyRef.current.future.length > 0,
    setDbmlText: updateDbmlText,
    setSelected,
    setSnapToGrid,
    undo,
    redo,
    beginHistoryBatch,
    endHistoryBatch,
    setDiagramName: renameDiagram,
    createDiagram,
    openDiagram,
    deleteDiagram,
    applyAutoLayout,
    saveLayoutToEditor,
    updateDiagramVisual,
    updateTable,
    moveTable,
    resizeTable,
    addColumn,
    updateColumn,
    removeColumn,
    updateRelation,
    resetRelation,
    addViaPoint,
    updateViaPoint,
    removeViaPoint,
    updateGroup,
    moveGroup,
    resizeGroup,
    addGroup,
    sendGroupBackward,
    bringGroupForward,
  };
}

function formatDbmlError(error: unknown): string {
  return error instanceof Error ? error.message : "DBML invalido.";
}

function createColumn(tableName: string, name: string, index: number): ColumnModel {
  return {
    id: makeId("column", `${tableName}-${name}`, index),
    name,
    type: "varchar",
    nullable: true,
    primaryKey: false,
    foreignKey: false,
    unique: false,
    rawSettings: [],
  };
}

function nextColumnName(columns: ColumnModel[]): string {
  const names = new Set(columns.map((column) => column.name));
  let index = columns.length + 1;
  let name = `column_${index}`;

  while (names.has(name)) {
    index += 1;
    name = `column_${index}`;
  }

  return name;
}

function normalizeManualForeignKeySetting(column: ColumnModel): ColumnModel {
  const rawSettings = column.rawSettings.filter((setting) => {
    const lower = setting.toLowerCase();
    return lower !== "fk" && lower !== "foreign key";
  });

  if (column.foreignKey) {
    rawSettings.push("fk");
  }

  return { ...column, rawSettings };
}

function loadDiagramLibrary(): DiagramLibrary {
  const stored = readStoredDiagrams();
  const legacyDbml = localStorage.getItem(LEGACY_SAVED_DBML_KEY);

  const diagrams = stored.length
    ? stored
    : [
        {
          id: uniqueId("diagram"),
          name: "Diagrama 1",
          dbml: migrateDarkOnlyDbml(legacyDbml ?? demoDbml),
          updatedAt: Date.now(),
        },
      ];
  const activeId = localStorage.getItem(ACTIVE_DIAGRAM_STORAGE_KEY);
  const activeDiagram = diagrams.find((item) => item.id === activeId) ?? diagrams[0];

  writeDiagramLibrary(diagrams, activeDiagram.id);
  return {
    diagrams,
    activeDiagramId: activeDiagram.id,
    activeDiagram,
  };
}

function readStoredDiagrams(): SavedDiagram[] {
  try {
    const raw = localStorage.getItem(DIAGRAMS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isStoredDiagram)
      .map((item) => ({
        id: item.id,
        name: normalizeDiagramName(item.name),
        dbml: migrateDarkOnlyDbml(item.dbml),
        updatedAt: item.updatedAt,
      }));
  } catch {
    return [];
  }
}

function writeDiagramLibrary(diagrams: SavedDiagram[], activeDiagramId: string): void {
  localStorage.setItem(DIAGRAMS_STORAGE_KEY, JSON.stringify(diagrams));
  localStorage.setItem(ACTIVE_DIAGRAM_STORAGE_KEY, activeDiagramId);
}

function isStoredDiagram(value: unknown): value is SavedDiagram {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedDiagram>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.dbml === "string" &&
    typeof item.updatedAt === "number"
  );
}

function normalizeDiagramName(value: string): string {
  return value.trim() || "Diagrama sem nome";
}

function nextDiagramName(diagrams: SavedDiagram[]): string {
  let index = diagrams.length + 1;
  const names = new Set(diagrams.map((item) => item.name));

  while (names.has(`Diagrama ${index}`)) {
    index += 1;
  }

  return `Diagrama ${index}`;
}

function createBlankDiagramDbml(): string {
  return `// @diagram
// background=${defaultDiagramVisual.backgroundColor}
// gridColor=${defaultDiagramVisual.gridColor}
// gridSize=${defaultDiagramVisual.gridSize}
`;
}

function migrateDarkOnlyDbml(dbml: string): string {
  return dbml
    .replace(/\/\/ background=#f8fafc/g, "// background=#0f172a")
    .replace(/\/\/ gridColor=#d7dee8/g, "// gridColor=#1f2a3a")
    .replace(/\/\/ background=#ffffff/g, "// background=#111827")
    .replace(/\/\/ header=#dbeafe/g, "// header=#1e3a5f")
    .replace(/\/\/ header=#e0f2fe/g, "// header=#253142")
    .replace(/\/\/ header=#ccfbf1/g, "// header=#12312e")
    .replace(/\/\/ text=#111827/g, "// text=#e5edf7")
    .replace(/\/\/ text=#172033/g, "// text=#e5edf7");
}
