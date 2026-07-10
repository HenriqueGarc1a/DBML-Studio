import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultBadgeVisuals,
  defaultDiagramVisual,
  defaultGroupVisual,
  defaultRelationVisual,
  defaultTableVisual,
  GROUP_LABEL_DEFAULT_X,
  GROUP_LABEL_DEFAULT_Y,
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
  getTableMinHeight,
  normalizeGridSize,
  normalizeRouteMargin,
  TABLE_MIN_WIDTH,
} from "../model/defaults";
import type {
  ColumnModel,
  DiagramModel,
  Direction,
  GroupModel,
  Point,
  RelationModel,
  Selection,
  TableModel,
} from "../model/types";
import { exportDbml } from "../exporter/dbmlExporter";
import { applyUiLayout, exportUiLayout } from "../exporter/uiLayoutFile";
import { sqlToDbml } from "../importer/sqlToDbml";
import { parseDbml } from "../parser/dbmlParser";
import { listWorkspaceDbml, saveWorkspaceDbml, sendWorkspaceDbmlBeacon } from "../utils/fileSave";
import { makeId, slugify, uniqueId } from "../utils/id";
import { organizeRelationRoute, relationKeepsTableMargin } from "../utils/relationRouting";
import { readJson, safeGetItem, safeSetItem, writeJson } from "../utils/storage";
import { nearestNonOverlappingPosition } from "../utils/tableCollision";
import { demoDbml } from "./demoDbml";

export interface DiagramController {
  dbmlText: string;
  diagram: DiagramModel;
  diagrams: SavedDiagram[];
  activeDiagramId: string;
  diagramName: string;
  diagramFilename: string;
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
  createDiagramFromSql: (sql: string) => Promise<void>;
  openDiagram: (id: string) => Promise<void>;
  applyAutoLayout: () => Promise<void>;
  saveLayoutToEditor: () => Promise<string>;
  updateDiagramVisual: (patch: Partial<DiagramModel["visual"]>) => void;
  addTable: () => void;
  updateTable: (id: string, patch: Partial<TableModel>) => void;
  moveTable: (id: string, dx: number, dy: number) => void;
  resizeTable: (id: string, width: number) => void;
  settleTable: (id: string) => void;
  removeTable: (id: string) => void;
  addColumn: (tableId: string) => void;
  updateColumn: (tableId: string, columnId: string, patch: Partial<ColumnModel>) => void;
  removeColumn: (tableId: string, columnId: string) => void;
  addRelation: (fromTableId: string, fromColumn: string, toTableId: string, toColumn: string) => void;
  removeRelation: (id: string) => void;
  updateRelation: (id: string, patch: Partial<RelationModel>) => void;
  tidyRelation: (id: string) => void;
  tidyRelations: () => void;
  resetRelation: (id: string) => void;
  addViaPoint: (id: string, point: Point) => void;
  updateViaPoint: (id: string, index: number, point: Point) => void;
  removeViaPoint: (id: string, index: number) => void;
  updateGroup: (id: string, patch: Partial<GroupModel>) => void;
  moveGroup: (id: string, dx: number, dy: number) => void;
  resizeGroup: (id: string, width: number, height: number) => void;
  addGroup: () => void;
  removeGroup: (id: string) => void;
  sendGroupBackward: (id: string) => void;
  bringGroupForward: (id: string) => void;
}

export interface SavedDiagram {
  id: string;
  name: string;
  dbml: string;
  uiLayout?: string;
  updatedAt: number;
  filename?: string;
}

const emptyDiagram: DiagramModel = {
  id: "diagram-main",
  visual: createDiagramVisual(),
  tables: [],
  relations: [],
  groups: [],
  enums: [],
  source: "",
};

const LEGACY_SAVED_DBML_KEY = "dbml-studio-saved-dbml";
const DIAGRAMS_STORAGE_KEY = "dbml-studio-diagrams";
const ACTIVE_DIAGRAM_STORAGE_KEY = "dbml-studio-active-diagram-id";
const ACTIVE_DIAGRAM_FILENAME_STORAGE_KEY = "dbml-studio-active-diagram-filename";
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

interface PersistedDiagramSnapshot {
  name: string;
  dbml: string;
  uiLayout: string;
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
  const workspaceSaveTimerRef = useRef<number | undefined>();

  const bumpHistoryVersion = useCallback(() => setHistoryVersion((version) => version + 1), []);

  const commitDiagramLibrary = useCallback((nextDiagrams: SavedDiagram[], nextActiveId: string) => {
    diagramsRef.current = nextDiagrams;
    activeDiagramIdRef.current = nextActiveId;
    setDiagrams(nextDiagrams);
    setActiveDiagramId(nextActiveId);
    writeDiagramLibrary(nextDiagrams, nextActiveId);
  }, []);

  const persistCurrentDiagram = useCallback((options: { silent?: boolean } = {}): PersistedDiagramSnapshot => {
    const id = activeDiagramIdRef.current;
    const now = Date.now();
    const name = normalizeDiagramName(diagramNameRef.current);
    const dbml = exportDbml(diagramRef.current);
    const uiLayout = exportUiLayout(diagramRef.current);
    let found = false;

    lastValidDbmlRef.current = dbml;
    const nextDiagrams = diagramsRef.current.map((item) => {
      if (item.id !== id) return item;
      found = true;
      return { ...item, name, dbml, uiLayout, updatedAt: now };
    });

    if (!found) {
      nextDiagrams.push({ id, name, dbml, uiLayout, updatedAt: now, filename: dbmlFilename(name) });
    }

    commitDiagramLibrary(nextDiagrams, id);
    safeSetItem(LEGACY_SAVED_DBML_KEY, dbml);

    if (!options.silent) {
      setSaveMessage(`Salvo ${new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    }

    return { name, dbml, uiLayout };
  }, [commitDiagramLibrary]);

  const scheduleWorkspaceSave = useCallback((dbml: string, delay = 800) => {
    if (!dbml.trim()) return;
    if (workspaceSaveTimerRef.current !== undefined) {
      window.clearTimeout(workspaceSaveTimerRef.current);
    }

    const filename = currentDbmlFilename(
      diagramsRef.current,
      activeDiagramIdRef.current,
      normalizeDiagramName(diagramNameRef.current),
    );

    workspaceSaveTimerRef.current = window.setTimeout(() => {
      workspaceSaveTimerRef.current = undefined;
      void saveWorkspaceDbml(filename, dbml, { uiLayout: exportUiLayout(diagramRef.current) });
    }, delay);
  }, []);

  useEffect(() => {
    return () => {
      if (workspaceSaveTimerRef.current !== undefined) {
        window.clearTimeout(workspaceSaveTimerRef.current);
      }
    };
  }, []);

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
    options: { resetHistory?: boolean; uiLayout?: string } = {},
  ) => {
    const revision = parseRevisionRef.current + 1;
    parseRevisionRef.current = revision;

    try {
      const parsed = applyUiLayout(parseDbml(text), options.uiLayout);
      const { layoutDiagram } = await import("../layout/autoLayout");
      const laidOut = await layoutDiagram(parsed, { preserveManual: true });
      const safelyRouted = {
        ...laidOut,
        relations: laidOut.relations.map((relation) => tidyRelationGeometry(relation, laidOut.tables, laidOut.visual.tableRouteMargin)),
      };

      if (revision !== parseRevisionRef.current) return false;

      lastValidDbmlRef.current = text;
      initialRelationsRef.current = new Map(safelyRouted.relations.map((relation) => [relation.id, relation]));
      setDbmlError(undefined);
      replaceDiagram(safelyRouted, {
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
    void importDbmlText(value, { resetHistory: true }).then((valid) => {
      if (valid) scheduleWorkspaceSave(value);
    });
  }, [importDbmlText, scheduleWorkspaceSave]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialDiagram() {
      const files = await listWorkspaceDbml();

      if (!cancelled && files?.length) {
        const nextDiagrams = files.map((file) => ({
          id: `file:${file.filename}`,
          name: normalizeDiagramName(file.name),
          dbml: migrateDarkOnlyDbml(file.dbml),
          uiLayout: file.uiLayout,
          updatedAt: file.updatedAt,
          filename: file.filename,
        }));
        const previousActiveId = activeDiagramIdRef.current;
        const previousFilename =
          diagramsRef.current.find((item) => item.id === previousActiveId)?.filename ??
          safeGetItem(ACTIVE_DIAGRAM_FILENAME_STORAGE_KEY);
        const active =
          nextDiagrams.find((item) => item.id === previousActiveId) ??
          nextDiagrams.find((item) => item.filename === previousFilename) ??
          nextDiagrams[0];

        diagramNameRef.current = active.name;
        setDiagramNameState(active.name);
        setDbmlText(active.dbml);
        lastValidDbmlRef.current = active.dbml;
        setDbmlError(undefined);
        commitDiagramLibrary(nextDiagrams, active.id);

        const loaded = await importDbmlText(active.dbml, { resetHistory: true, uiLayout: active.uiLayout });
        if (!cancelled) {
          setSaveMessage(loaded ? "" : "Arquivo DBML inválido");
        }
        return;
      }

      if (!cancelled) {
        await importDbmlText(lastValidDbmlRef.current, { resetHistory: true });
      }
    }

    void loadInitialDiagram();

    return () => {
      cancelled = true;
    };
  }, [commitDiagramLibrary, importDbmlText]);

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
          scheduleWorkspaceSave(nextDbml);
        }
      }
    }

    void updateExports();

    return () => {
      cancelled = true;
    };
  }, [diagram, scheduleWorkspaceSave]);


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
    const snapshot = persistCurrentDiagram();
    void saveWorkspaceDbml(currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name), snapshot.dbml, {
      keepalive: true, uiLayout: snapshot.uiLayout,
    });
    return nextDbml;
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

    const snapshot = persistCurrentDiagram({ silent: true });
    void saveWorkspaceDbml(currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name), snapshot.dbml, { uiLayout: snapshot.uiLayout });
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
    await importDbmlText(record.dbml, { resetHistory: true, uiLayout: record.uiLayout });
  }, [importDbmlText, persistCurrentDiagram]);

  const createDiagram = useCallback(async () => {
    const snapshot = persistCurrentDiagram({ silent: true });
    void saveWorkspaceDbml(currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name), snapshot.dbml, {
      keepalive: true, uiLayout: snapshot.uiLayout,
    });

    const id = uniqueId("diagram");
    const name = nextDiagramName(diagramsRef.current);
    const dbml = createBlankDiagramDbml();
    const now = Date.now();
    const record: SavedDiagram = { id, name, dbml, updatedAt: now, filename: dbmlFilename(name) };
    const nextDiagrams = [...diagramsRef.current, record];

    diagramNameRef.current = name;
    setDiagramNameState(name);
    setDbmlText(dbml);
    lastValidDbmlRef.current = dbml;
    setDbmlError(undefined);
    setSaveMessage(`Novo ${name}`);
    commitDiagramLibrary(nextDiagrams, id);
    void saveWorkspaceDbml(record.filename ?? dbmlFilename(name), dbml, { keepalive: true });
    await importDbmlText(dbml, { resetHistory: true });
  }, [commitDiagramLibrary, importDbmlText, persistCurrentDiagram]);

  const createDiagramFromSql = useCallback(async (sql: string) => {
    const dbml = sqlToDbml(sql);
    const snapshot = persistCurrentDiagram({ silent: true });
    void saveWorkspaceDbml(currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name), snapshot.dbml, {
      keepalive: true, uiLayout: snapshot.uiLayout,
    });

    const id = uniqueId("diagram");
    const name = nextNamedDiagramName(diagramsRef.current, "Esquema SQL");
    const now = Date.now();
    const record: SavedDiagram = { id, name, dbml, updatedAt: now, filename: dbmlFilename(name) };
    const nextDiagrams = [...diagramsRef.current, record];

    diagramNameRef.current = name;
    setDiagramNameState(name);
    setDbmlText(dbml);
    lastValidDbmlRef.current = dbml;
    setDbmlError(undefined);
    setSaveMessage(`Novo ${name}`);
    commitDiagramLibrary(nextDiagrams, id);
    void saveWorkspaceDbml(record.filename ?? dbmlFilename(name), dbml, { keepalive: true });

    const loaded = await importDbmlText(dbml, { resetHistory: true });
    if (!loaded) {
      throw new Error("SQL convertido, mas o DBML gerado não pôde ser carregado.");
    }
  }, [commitDiagramLibrary, importDbmlText, persistCurrentDiagram]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const snapshot = persistCurrentDiagram({ silent: true });
      void saveWorkspaceDbml(currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name), snapshot.dbml, { uiLayout: snapshot.uiLayout });
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [persistCurrentDiagram]);

  useEffect(() => {
    const saveBeforeClose = () => {
      const snapshot = persistCurrentDiagram({ silent: true });
      const filename = currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name);

      if (workspaceSaveTimerRef.current !== undefined) {
        window.clearTimeout(workspaceSaveTimerRef.current);
        workspaceSaveTimerRef.current = undefined;
      }

      if (!sendWorkspaceDbmlBeacon(filename, snapshot.dbml, snapshot.uiLayout)) {
        void saveWorkspaceDbml(filename, snapshot.dbml, { keepalive: true, uiLayout: snapshot.uiLayout });
      }
    };
    window.addEventListener("pagehide", saveBeforeClose);
    return () => window.removeEventListener("pagehide", saveBeforeClose);
  }, [persistCurrentDiagram]);

  const updateDiagramVisual = useCallback((patch: Partial<DiagramModel["visual"]>) => {
    updateDiagramState((current) => {
      const visual: DiagramModel["visual"] = {
        ...current.visual,
        ...patch,
        defaultTable: {
          ...current.visual.defaultTable,
          ...(patch.defaultTable ?? {}),
        },
        badges: {
          primaryKey: {
            ...current.visual.badges.primaryKey,
            ...(patch.badges?.primaryKey ?? {}),
          },
          foreignKey: {
            ...current.visual.badges.foreignKey,
            ...(patch.badges?.foreignKey ?? {}),
          },
          notNull: {
            ...current.visual.badges.notNull,
            ...(patch.badges?.notNull ?? {}),
          },
          unique: {
            ...current.visual.badges.unique,
            ...(patch.badges?.unique ?? {}),
          },
        },
        savedColors: patch.savedColors ? normalizeSavedColors(patch.savedColors) : current.visual.savedColors,
      };

      if (patch.gridSize !== undefined) {
        visual.gridSize = normalizeGridSize(patch.gridSize, current.visual.gridSize);
      }
      if (patch.tableRouteMargin !== undefined) {
        visual.tableRouteMargin = normalizeRouteMargin(patch.tableRouteMargin, current.visual.tableRouteMargin);
      }

      const next = { ...current, visual };
      return patch.tableRouteMargin === undefined
        ? next
        : { ...next, relations: next.relations.map((relation) => tidyRelationGeometry(relation, next.tables, visual.tableRouteMargin)) };
    });
  }, [updateDiagramState]);

  const addTable = useCallback(() => {
    let tableId = "";

    updateDiagramState((current) => {
      const name = nextTableName(current.tables);
      const id = slugify(name);
      tableId = id;
      const columns: ColumnModel[] = [];
      const table: TableModel = {
        id,
        name,
        columns,
        x: 80 + (current.tables.length % 3) * 300,
        y: 80 + Math.floor(current.tables.length / 3) * 220,
        width: TABLE_MIN_WIDTH,
        height: getTableMinHeight(columns.length),
        visual: { ...current.visual.defaultTable },
        usesDefaultStyle: true,
        usesGroupStyle: false,
        indexes: [],
        layoutSource: "manual",
      };

      return enforceRelationClearance({ ...current, tables: [...current.tables, table] });
    });

    if (tableId) {
      setSelected({ type: "table", id: tableId });
    }
  }, [updateDiagramState]);

  const updateTable = useCallback((id: string, patch: Partial<TableModel>) => {
    updateDiagramState((current) => enforceRelationClearance({
      ...current,
      tables: current.tables.map((table) => {
        if (table.id !== id) return table;

        const nextTable = {
          ...table,
          ...patch,
          visual: { ...table.visual, ...(patch.visual ?? {}) },
          layoutSource: patch.x !== undefined || patch.y !== undefined ? "manual" : table.layoutSource,
        };

        return {
          ...nextTable,
          height: getTableMinHeight(nextTable.columns.length),
        };
      }),
    }));
  }, [updateDiagramState]);

  const moveTable = useCallback((id: string, dx: number, dy: number) => {
    updateDiagramState((current) => {
      const tables = current.tables.map((table) => table.id === id
        ? { ...table, x: table.x + dx, y: table.y + dy, layoutSource: "manual" as const }
        : table);

      // A moved table can block any line, not only its own. Re-route every
      // relation while retaining its visual settings and preferred sides.
      return enforceRelationClearance({
        ...current,
        tables,
        relations: current.relations.map((relation) => tidyRelationGeometry(relation, tables, current.visual.tableRouteMargin)),
      });
    });
  }, [updateDiagramState]);

  const resizeTable = useCallback((id: string, width: number) => {
    updateTable(id, {
      width: Math.max(TABLE_MIN_WIDTH, width),
      layoutSource: "manual",
    });
  }, [updateTable]);

  const settleTable = useCallback((id: string) => {
    updateDiagramState((current) => {
      const table = current.tables.find((item) => item.id === id);
      if (!table) return current;
      const position = nearestNonOverlappingPosition(table, current.tables);
      if (position.x === table.x && position.y === table.y) return current;
      const tables = current.tables.map((item) => item.id === id
        ? { ...item, ...position, layoutSource: "manual" as const }
        : item);
      return enforceRelationClearance({ ...current, tables });
    });
  }, [updateDiagramState]);

  const removeTable = useCallback((id: string) => {
    updateDiagramState((current) => enforceRelationClearance({
      ...current,
      tables: current.tables.filter((table) => table.id !== id),
      relations: current.relations.filter((relation) => relation.fromTable !== id && relation.toTable !== id),
      groups: current.groups.map((group) => ({
        ...group,
        tables: group.tables.filter((tableId) => tableId !== id),
      })),
    }));
    setSelected(undefined);
  }, [updateDiagramState]);

  const addColumn = useCallback((tableId: string) => {
    updateDiagramState((current) => enforceRelationClearance({
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
          height: getTableMinHeight(columns.length),
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
        return enforceRelationClearance({ ...current, tables });
      }

      return enforceRelationClearance({
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
      });
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
          height: getTableMinHeight(columns.length),
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

  const addRelation = useCallback((
    fromTableId: string,
    fromColumn: string,
    toTableId: string,
    toColumn: string,
  ) => {
    let relationId: string | undefined;

    updateDiagramState((current) => {
      if (fromTableId === toTableId && fromColumn === toColumn) return current;

      const fromTable = current.tables.find((table) => table.id === fromTableId);
      const toTable = current.tables.find((table) => table.id === toTableId);
      if (!fromTable || !toTable) return current;

      const duplicate = current.relations.find((relation) =>
        relation.fromTable === fromTableId &&
        relation.fromColumn === fromColumn &&
        relation.toTable === toTableId &&
        relation.toColumn === toColumn,
      );
      if (duplicate) {
        relationId = duplicate.id;
        return current;
      }

      const [fromSide, toSide] = inferRelationSides(fromTable, toTable);
      let relation: RelationModel = {
        id: makeId(
          "relation",
          `${fromTable.name}-${fromColumn}-${toTable.name}-${toColumn}`,
          current.relations.length,
        ),
        fromTable: fromTableId,
        fromColumn,
        toTable: toTableId,
        toColumn,
        ...defaultRelationVisual,
        fromSide,
        toSide,
      };
      const organized = organizeRelationRoute(relation, fromTable, toTable, current.tables, fromSide, toSide, current.visual.tableRouteMargin);
      relation = { ...relation, ...organized };
      relationId = relation.id;

      return {
        ...current,
        tables: current.tables.map((table) =>
          table.id === fromTableId
            ? {
                ...table,
                columns: table.columns.map((column) =>
                  column.name === fromColumn ? { ...column, foreignKey: true } : column,
                ),
              }
            : table,
        ),
        relations: [...current.relations, relation],
      };
    });

    if (relationId) {
      setSelected({ type: "relation", id: relationId });
    }
  }, [updateDiagramState]);

  const removeRelation = useCallback((id: string) => {
    updateDiagramState((current) => {
      const removed = current.relations.find((relation) => relation.id === id);
      const relations = current.relations.filter((relation) => relation.id !== id);

      if (!removed) return { ...current, relations };

      return {
        ...current,
        relations,
        tables: current.tables.map((table) => {
          if (table.id !== removed.fromTable) return table;

          const stillRelationBacked = relations.some((relation) =>
            relation.fromTable === removed.fromTable && relation.fromColumn === removed.fromColumn,
          );

          if (stillRelationBacked) return table;

          return {
            ...table,
            columns: table.columns.map((column) =>
              column.name === removed.fromColumn && !hasManualForeignKeySetting(column)
                ? { ...column, foreignKey: false }
                : column,
            ),
          };
        }),
      };
    });
    setSelected(undefined);
  }, [updateDiagramState]);

  const updateRelation = useCallback((id: string, patch: Partial<RelationModel>) => {
    updateDiagramState((current) => enforceRelationClearance({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id ? { ...relation, ...patch } : relation,
      ),
    }));
  }, [updateDiagramState]);

  const tidyRelation = useCallback((id: string) => {
    updateDiagramState((current) => enforceRelationClearance({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id ? tidyRelationGeometry(relation, current.tables, current.visual.tableRouteMargin) : relation,
      ),
    }));
  }, [updateDiagramState]);

  const tidyRelations = useCallback(() => {
    updateDiagramState((current) => enforceRelationClearance({
      ...current,
      relations: current.relations.map((relation) => tidyRelationGeometry(relation, current.tables, current.visual.tableRouteMargin)),
    }));
  }, [updateDiagramState]);

  const resetRelation = useCallback((id: string) => {
    updateDiagramState((current) => enforceRelationClearance({
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
              viaPoints: [],
            };
      }),
    }));
  }, [updateDiagramState]);

  const addViaPoint = useCallback((id: string, point: Point) => {
    updateDiagramState((current) => enforceRelationClearance({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id
          ? { ...relation, route: "orthogonal", viaPoints: [...relation.viaPoints, point] }
          : relation,
      ),
    }));
  }, [updateDiagramState]);

  const updateViaPoint = useCallback((id: string, index: number, point: Point) => {
    updateDiagramState((current) => enforceRelationClearance({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id
          ? {
              ...relation,
              route: "orthogonal",
              viaPoints: relation.viaPoints.map((viaPoint, viaIndex) =>
                viaIndex === index ? point : viaPoint,
              ),
            }
          : relation,
      ),
    }));
  }, [updateDiagramState]);

  const removeViaPoint = useCallback((id: string, index: number) => {
    updateDiagramState((current) => enforceRelationClearance({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id
          ? {
              ...relation,
              route: "orthogonal",
              viaPoints: relation.viaPoints.filter((_, viaIndex) => viaIndex !== index),
            }
          : relation,
      ),
    }));
  }, [updateDiagramState]);

  const updateGroup = useCallback((id: string, patch: Partial<GroupModel>) => {
    updateDiagramState((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === id ? normalizeGroup({ ...group, ...patch }) : group)),
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
      tableVisual: { ...defaultGroupVisual.tableVisual },
      tables: [],
    };

    updateDiagramState((current) => ({ ...current, groups: [...current.groups, group] }));
    setSelected({ type: "group", id });
  }, [diagram.tables, selected, updateDiagramState]);

  const removeGroup = useCallback((id: string) => {
    updateDiagramState((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== id),
    }));
    setSelected(undefined);
  }, [updateDiagramState]);

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
    setSelected((currentSelection) =>
      currentSelection && selectionExists(previous, currentSelection) ? currentSelection : undefined,
    );
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
    setSelected((currentSelection) =>
      currentSelection && selectionExists(next, currentSelection) ? currentSelection : undefined,
    );
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
    diagramFilename: currentDbmlFilename(diagrams, activeDiagramId, diagramName),
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
    createDiagramFromSql,
    openDiagram,
    applyAutoLayout,
    saveLayoutToEditor,
    updateDiagramVisual,
    addTable,
    updateTable,
    moveTable,
    resizeTable,
    settleTable,
    removeTable,
    addColumn,
    updateColumn,
    removeColumn,
    addRelation,
    removeRelation,
    updateRelation,
    tidyRelation,
    tidyRelations,
    resetRelation,
    addViaPoint,
    updateViaPoint,
    removeViaPoint,
    updateGroup,
    moveGroup,
    resizeGroup,
    addGroup,
    removeGroup,
    sendGroupBackward,
    bringGroupForward,
  };
}

function createDiagramVisual(): DiagramModel["visual"] {
  return {
    backgroundColor: defaultDiagramVisual.backgroundColor,
    gridColor: defaultDiagramVisual.gridColor,
    gridSize: defaultDiagramVisual.gridSize,
    tableRouteMargin: defaultDiagramVisual.tableRouteMargin,
    defaultTable: { ...defaultTableVisual },
    badges: {
      primaryKey: { ...defaultBadgeVisuals.primaryKey },
      foreignKey: { ...defaultBadgeVisuals.foreignKey },
      notNull: { ...defaultBadgeVisuals.notNull },
      unique: { ...defaultBadgeVisuals.unique },
    },
    savedColors: [],
  };
}

function formatDbmlError(error: unknown): string {
  return error instanceof Error ? error.message : "DBML inválido.";
}

function selectionExists(diagram: DiagramModel, selection: Selection): boolean {
  if (selection.type === "table") return diagram.tables.some((table) => table.id === selection.id);
  if (selection.type === "relation") return diagram.relations.some((relation) => relation.id === selection.id);
  return diagram.groups.some((group) => group.id === selection.id);
}

function normalizeGroup(group: GroupModel): GroupModel {
  const labelX = Number.isFinite(group.labelX) ? group.labelX : GROUP_LABEL_DEFAULT_X;
  const labelY = Number.isFinite(group.labelY) ? group.labelY : GROUP_LABEL_DEFAULT_Y;

  return {
    ...group,
    labelX: clamp(labelX, 6, Math.max(6, group.width - 6)),
    labelY: clamp(labelY, 16, Math.max(16, group.height - 8)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function nextTableName(tables: TableModel[]): string {
  const names = new Set(tables.map((table) => table.name));
  let index = tables.length + 1;
  let name = `tabela-${index}`;

  while (names.has(name)) {
    index += 1;
    name = `tabela-${index}`;
  }

  return name;
}

function inferRelationSides(fromTable: TableModel, toTable: TableModel): [Direction, Direction] {
  const fromCenterX = fromTable.x + fromTable.width / 2;
  const toCenterX = toTable.x + toTable.width / 2;
  return toCenterX >= fromCenterX ? ["east", "west"] : ["west", "east"];
}

function tidyRelationGeometry(relation: RelationModel, tables: TableModel[], margin = defaultDiagramVisual.tableRouteMargin): RelationModel {
  const fromTable = tables.find((table) => table.id === relation.fromTable);
  const toTable = tables.find((table) => table.id === relation.toTable);
  if (!fromTable || !toTable) return relation;

  const [fromSide, toSide] = inferRelationSides(fromTable, toTable);
  const route = organizeRelationRoute(relation, fromTable, toTable, tables, fromSide, toSide, margin);

  return {
    ...relation,
    fromSide: route.fromSide,
    toSide: route.toSide,
    route: "orthogonal",
    viaPoints: route.viaPoints,
  };
}

function enforceRelationClearance(diagram: DiagramModel): DiagramModel {
  let changed = false;
  const relations = diagram.relations.map((relation) => {
    if (relationKeepsTableMargin(relation, diagram.tables, diagram.visual.tableRouteMargin)) return relation;
    changed = true;
    return tidyRelationGeometry(relation, diagram.tables, diagram.visual.tableRouteMargin);
  });
  return changed ? { ...diagram, relations } : diagram;
}

function normalizeSavedColors(colors: DiagramModel["visual"]["savedColors"]): DiagramModel["visual"]["savedColors"] {
  const seen = new Set<string>();
  const next: DiagramModel["visual"]["savedColors"] = [];

  for (const [index, item] of colors.entries()) {
    const color = item.color;
    if (!/^#[0-9a-fA-F]{3}$/.test(color) && !/^#[0-9a-fA-F]{6}$/.test(color)) continue;
    const name = item.name.trim() || `Cor ${index + 1}`;
    const key = `${name.toLowerCase()}|${color.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ name, color });
  }

  return next;
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

function hasManualForeignKeySetting(column: ColumnModel): boolean {
  return column.rawSettings.some((setting) => {
    const lower = setting.toLowerCase();
    return lower === "fk" || lower === "foreign key" || lower.startsWith("ref:");
  });
}

function loadDiagramLibrary(): DiagramLibrary {
  const stored = readStoredDiagrams();
  const legacyDbml = safeGetItem(LEGACY_SAVED_DBML_KEY);

  const diagrams = stored.length
    ? stored
    : [
        {
          id: uniqueId("diagram"),
          name: "Diagrama 1",
          dbml: migrateDarkOnlyDbml(legacyDbml ?? demoDbml),
          updatedAt: Date.now(),
          filename: dbmlFilename("Diagrama 1"),
        },
      ];
  const activeId = safeGetItem(ACTIVE_DIAGRAM_STORAGE_KEY);
  const activeFilename = safeGetItem(ACTIVE_DIAGRAM_FILENAME_STORAGE_KEY);
  const activeDiagram =
    diagrams.find((item) => item.id === activeId) ??
    diagrams.find((item) => item.filename === activeFilename) ??
    diagrams[0];

  writeDiagramLibrary(diagrams, activeDiagram.id);
  return {
    diagrams,
    activeDiagramId: activeDiagram.id,
    activeDiagram,
  };
}

function readStoredDiagrams(): SavedDiagram[] {
  const parsed = readJson<unknown>(DIAGRAMS_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(isStoredDiagram)
    .map((item) => ({
      id: item.id,
      name: normalizeDiagramName(item.name),
      dbml: migrateDarkOnlyDbml(item.dbml),
      uiLayout: item.uiLayout,
      updatedAt: item.updatedAt,
      filename: item.filename ?? dbmlFilename(item.name),
    }));
}

function writeDiagramLibrary(diagrams: SavedDiagram[], activeDiagramId: string): void {
  const active = diagrams.find((item) => item.id === activeDiagramId);

  writeJson(DIAGRAMS_STORAGE_KEY, diagrams);
  safeSetItem(ACTIVE_DIAGRAM_STORAGE_KEY, activeDiagramId);
  if (active?.filename) {
    safeSetItem(ACTIVE_DIAGRAM_FILENAME_STORAGE_KEY, active.filename);
  }
}

function isStoredDiagram(value: unknown): value is SavedDiagram {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedDiagram>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.dbml === "string" &&
    (item.uiLayout === undefined || typeof item.uiLayout === "string") &&
    typeof item.updatedAt === "number" &&
    (item.filename === undefined || typeof item.filename === "string")
  );
}

function normalizeDiagramName(value: string): string {
  return value.trim() || "Diagrama sem nome";
}

function nextDiagramName(diagrams: SavedDiagram[]): string {
  return nextNamedDiagramName(diagrams, "Diagrama");
}

function nextNamedDiagramName(diagrams: SavedDiagram[], prefix: string): string {
  let index = diagrams.length + 1;
  const names = new Set(diagrams.map((item) => item.name));

  while (names.has(`${prefix} ${index}`)) {
    index += 1;
  }

  return `${prefix} ${index}`;
}

function createBlankDiagramDbml(): string {
  return `// @diagram
// background=${defaultDiagramVisual.backgroundColor}
// gridColor=${defaultDiagramVisual.gridColor}
// gridSize=${defaultDiagramVisual.gridSize}
`;
}

function currentDbmlFilename(diagrams: SavedDiagram[], activeDiagramId: string, diagramName: string): string {
  return diagrams.find((item) => item.id === activeDiagramId)?.filename ?? dbmlFilename(diagramName);
}

function dbmlFilename(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "diagram";
  return `${cleaned}.dbml`;
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
