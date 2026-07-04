import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultDiagramVisual,
  defaultGroupVisual,
  defaultRelationVisual,
  getTableMinHeight,
  normalizeGridSize,
} from "../model/defaults";
import type {
  DiagramModel,
  GroupModel,
  Point,
  RelationModel,
  Selection,
  TableModel,
} from "../model/types";
import { parseDbml } from "../parser/dbmlParser";
import { uniqueId } from "../utils/id";
import { demoDbml } from "./demoDbml";

export interface DiagramController {
  dbmlText: string;
  diagram: DiagramModel;
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
  importFromEditor: () => Promise<void>;
  applyAutoLayout: () => Promise<void>;
  saveLayoutToEditor: () => Promise<void>;
  loadDemo: () => Promise<void>;
  updateDiagramVisual: (patch: Partial<DiagramModel["visual"]>) => void;
  updateTable: (id: string, patch: Partial<TableModel>) => void;
  moveTable: (id: string, dx: number, dy: number) => void;
  resizeTable: (id: string, width: number, height: number) => void;
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

const emptyDiagram: DiagramModel = {
  id: "diagram-main",
  visual: { ...defaultDiagramVisual },
  tables: [],
  relations: [],
  groups: [],
  enums: [],
  source: "",
};

const SAVED_DBML_KEY = "dbml-studio-saved-dbml";
const MAX_HISTORY_ENTRIES = 80;

interface DiagramHistory {
  past: DiagramModel[];
  future: DiagramModel[];
}

type DiagramChangeSource = "editor" | "ui" | "system";

export function useDiagramController(): DiagramController {
  const [dbmlText, setDbmlText] = useState(() => localStorage.getItem(SAVED_DBML_KEY) ?? demoDbml);
  const [diagram, setDiagramState] = useState<DiagramModel>(emptyDiagram);
  const [selected, setSelected] = useState<Selection | undefined>();
  const [exportedDbml, setExportedDbml] = useState("");
  const [exportedTikz, setExportedTikz] = useState("");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");
  const [dbmlError, setDbmlError] = useState<string | undefined>();
  const [, setHistoryVersion] = useState(0);
  const diagramRef = useRef<DiagramModel>(emptyDiagram);
  const historyRef = useRef<DiagramHistory>({ past: [], future: [] });
  const transactionStartRef = useRef<DiagramModel | undefined>();
  const diagramChangeSourceRef = useRef<DiagramChangeSource>("system");
  const initialRelationsRef = useRef(new Map<string, RelationModel>());
  const parseRevisionRef = useRef(0);
  const lastValidDbmlRef = useRef(dbmlText);

  const bumpHistoryVersion = useCallback(() => setHistoryVersion((version) => version + 1), []);

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
      const [{ exportDbml }, { exportTikz }] = await Promise.all([
        import("../exporter/dbmlExporter"),
        import("../exporter/tikzExporter"),
      ]);
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


  const importFromEditor = useCallback(async () => {
    await importDbmlText(dbmlText, { resetHistory: true });
    setSaveMessage("");
  }, [dbmlText, importDbmlText]);

  const applyAutoLayout = useCallback(async () => {
    const { layoutDiagram } = await import("../layout/autoLayout");
    const laidOut = await layoutDiagram(diagramRef.current, { preserveManual: false });
    setSaveMessage("");
    replaceDiagram(laidOut, { recordHistory: true, source: "ui" });
  }, [replaceDiagram]);

  const saveLayoutToEditor = useCallback(async () => {
    const { exportDbml } = await import("../exporter/dbmlExporter");
    const current = diagramRef.current;
    const nextDbml = exportDbml(current);
    setDbmlText(nextDbml);
    lastValidDbmlRef.current = nextDbml;
    setDbmlError(undefined);
    localStorage.setItem(SAVED_DBML_KEY, nextDbml);
    initialRelationsRef.current = new Map(current.relations.map((relation) => [relation.id, relation]));
    setSaveMessage(`Salvo ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  }, []);

  const loadDemo = useCallback(async () => {
    setDbmlText(demoDbml);
    localStorage.removeItem(SAVED_DBML_KEY);
    setSaveMessage("");
    await importDbmlText(demoDbml, { resetHistory: true });
  }, [importDbmlText]);

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
              width: Math.max(180, width),
              height: Math.max(getTableMinHeight(table.columns.length), height),
              layoutSource: "manual",
            }
          : table,
      ),
    }));
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
      width: Math.max(120, width),
      height: Math.max(90, height),
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
    importFromEditor,
    applyAutoLayout,
    saveLayoutToEditor,
    loadDemo,
    updateDiagramVisual,
    updateTable,
    moveTable,
    resizeTable,
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
