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
  EnumModel,
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
import { deleteWorkspaceDbml, listWorkspaceDbml, renameWorkspaceDbml, saveWorkspaceDbml, saveWorkspaceWiki, sendWorkspaceDbmlBeacon } from "../utils/fileSave";
import { makeId, slugify, uniqueId } from "../utils/id";
import {
  organizeRelationRoute,
  organizeRelationRouteOnFixedSides,
  relationKeepsTableMargin,
} from "../utils/relationRouting";
import { safeGetItem, safeSetItem } from "../utils/storage";
import { nearestNonOverlappingPosition } from "../utils/tableCollision";
import { findViaInsertionIndex } from "../utils/geometry";
import { ACTIVE_DIAGRAM_FILENAME_STORAGE_KEY, LEGACY_SAVED_DBML_KEY, createBlankDiagramDbml, currentDbmlFilename, dbmlFilename, loadDiagramLibrary, loadDiagramTrash, migrateDarkOnlyDbml, nextDiagramName, nextNamedDiagramName, normalizeDiagramName, writeDiagramLibrary, writeDiagramTrash, type DiagramLibrary, type SavedDiagram, type TrashedDiagram } from "./diagramLibrary";
import { parseProjectBundle } from "./projectBundle";
import { addDiagramSnapshot, loadDiagramSnapshots, writeDiagramSnapshots, type DiagramSnapshot, type SnapshotReason } from "./diagramSnapshots";
import type { DiagramController, DiagramSaveStatus } from "./types";

export type { DiagramController } from "./types";

export type { SavedDiagram } from "./diagramLibrary";

const emptyDiagram: DiagramModel = {
  id: "diagram-main",
  visual: createDiagramVisual(),
  tables: [],
  relations: [],
  groups: [],
  enums: [],
  source: "",
};

const MAX_HISTORY_ENTRIES = 80;

interface DiagramHistory {
  past: DiagramModel[];
  future: DiagramModel[];
}

type DiagramChangeSource = "editor" | "ui" | "system";


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
  const [trashedDiagrams, setTrashedDiagrams] = useState<TrashedDiagram[]>(() => loadDiagramTrash());
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
  const [loadedDiagramId, setLoadedDiagramId] = useState<string>();
  const [libraryReady, setLibraryReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<DiagramSaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<number | undefined>(initialLibrary.activeDiagram.updatedAt);
  const [snapshots, setSnapshots] = useState<DiagramSnapshot[]>(() => loadDiagramSnapshots());
  const [, setHistoryVersion] = useState(0);
  const diagramRef = useRef<DiagramModel>(emptyDiagram);
  const diagramsRef = useRef<SavedDiagram[]>(initialLibrary.diagrams);
  const trashedDiagramsRef = useRef<TrashedDiagram[]>(loadDiagramTrash());
  const activeDiagramIdRef = useRef(initialLibrary.activeDiagramId);
  const diagramNameRef = useRef(initialLibrary.activeDiagram.name);
  const historyRef = useRef<DiagramHistory>({ past: [], future: [] });
  const transactionStartRef = useRef<DiagramModel | undefined>();
  const diagramChangeSourceRef = useRef<DiagramChangeSource>("system");
  const initialRelationsRef = useRef(new Map<string, RelationModel>());
  const parseRevisionRef = useRef(0);
  const lastValidDbmlRef = useRef(initialLibrary.activeDiagram.dbml);
  const workspaceSaveTimerRef = useRef<number | undefined>();
  const renameTimerRef = useRef<number | undefined>();
  const pendingRenameRef = useRef<{ from: string; to: string; dbml: string; uiLayout: string } | undefined>();
  const snapshotsRef = useRef<DiagramSnapshot[]>(loadDiagramSnapshots());
  const lastAutomaticSnapshotRef = useRef(0);

  const bumpHistoryVersion = useCallback(() => setHistoryVersion((version) => version + 1), []);

  const commitDiagramLibrary = useCallback((nextDiagrams: SavedDiagram[], nextActiveId: string) => {
    diagramsRef.current = nextDiagrams;
    activeDiagramIdRef.current = nextActiveId;
    setDiagrams(nextDiagrams);
    setActiveDiagramId(nextActiveId);
    writeDiagramLibrary(nextDiagrams, nextActiveId);
  }, []);

  const commitDiagramTrash = useCallback((next: TrashedDiagram[]) => {
    trashedDiagramsRef.current = next;
    setTrashedDiagrams(next);
    writeDiagramTrash(next);
  }, []);

  const commitSnapshots = useCallback((next: DiagramSnapshot[]) => {
    snapshotsRef.current = next;
    setSnapshots(next);
    writeDiagramSnapshots(next);
  }, []);

  const persistCurrentDiagram = useCallback((options: { silent?: boolean; previewDataUrl?: string } = {}): PersistedDiagramSnapshot => {
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
      return { ...item, name, dbml, uiLayout, previewDataUrl: options.previewDataUrl ?? item.previewDataUrl, updatedAt: now };
    });

    if (!found) {
      nextDiagrams.push({ id, name, dbml, uiLayout, previewDataUrl: options.previewDataUrl, updatedAt: now, filename: dbmlFilename(name) });
    }

    commitDiagramLibrary(nextDiagrams, id);
    safeSetItem(LEGACY_SAVED_DBML_KEY, dbml);
    setLastSavedAt(now);
    setSaveStatus((current) => current === "saving" ? current : "local");

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

    workspaceSaveTimerRef.current = window.setTimeout(async () => {
      workspaceSaveTimerRef.current = undefined;
      setSaveStatus("saving");
      const saved = await saveWorkspaceDbml(filename, dbml, { uiLayout: exportUiLayout(diagramRef.current) });
      setLastSavedAt(Date.now());
      setSaveStatus(saved ? "saved" : "local");
    }, delay);
  }, []);

  useEffect(() => {
    return () => {
      if (workspaceSaveTimerRef.current !== undefined) {
        window.clearTimeout(workspaceSaveTimerRef.current);
      }
      if (renameTimerRef.current !== undefined) {
        window.clearTimeout(renameTimerRef.current);
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
    setSaveStatus("dirty");

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
    const targetDiagramId = activeDiagramIdRef.current;
    parseRevisionRef.current = revision;
    setLoadedDiagramId((current) => current === targetDiagramId ? undefined : current);

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
      if (activeDiagramIdRef.current === targetDiagramId) setLoadedDiagramId(targetDiagramId);
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
    setSaveStatus("dirty");
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
          wiki: file.wiki,
          wikiDocument: file.wikiDocument,
          uiLayout: file.uiLayout,
          previewDataUrl: file.previewDataUrl,
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

    void loadInitialDiagram().finally(() => {
      if (!cancelled) setLibraryReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [commitDiagramLibrary, importDbmlText]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

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

    timer = window.setTimeout(() => void updateExports(), 120);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [diagram, scheduleWorkspaceSave]);


  const applyAutoLayout = useCallback(async () => {
    const { countRelationCrossings, layoutDiagramForMinimumCrossings } = await import("../layout/crossingOptimizedLayout");
    const laidOut = await layoutDiagramForMinimumCrossings(diagramRef.current);
    replaceDiagram(laidOut, { recordHistory: true, source: "ui" });
    const crossings = countRelationCrossings(laidOut);
    setSaveMessage(`Auto-layout: ${crossings} cruzamento${crossings === 1 ? "" : "s"}`);
    return laidOut;
  }, [replaceDiagram]);

  const createSnapshot = useCallback((reason: SnapshotReason = "manual") => {
    const snapshot: DiagramSnapshot = {
      id: uniqueId("snapshot"),
      diagramId: activeDiagramIdRef.current,
      name: normalizeDiagramName(diagramNameRef.current),
      dbml: exportDbml(diagramRef.current),
      uiLayout: exportUiLayout(diagramRef.current),
      createdAt: Date.now(),
      reason,
    };
    commitSnapshots(addDiagramSnapshot(snapshotsRef.current, snapshot));
    if (reason === "automatic") lastAutomaticSnapshotRef.current = snapshot.createdAt;
  }, [commitSnapshots]);

  const restoreSnapshot = useCallback(async (id: string) => {
    const snapshot = snapshotsRef.current.find((item) => item.id === id && item.diagramId === activeDiagramIdRef.current);
    if (!snapshot) return false;
    createSnapshot("before-restore");
    setDbmlText(snapshot.dbml);
    const loaded = await importDbmlText(snapshot.dbml, { resetHistory: true, uiLayout: snapshot.uiLayout });
    if (!loaded) return false;
    setSaveStatus("dirty");
    scheduleWorkspaceSave(snapshot.dbml, 100);
    setSaveMessage(`Versão de ${new Date(snapshot.createdAt).toLocaleString()} restaurada`);
    return true;
  }, [createSnapshot, importDbmlText, scheduleWorkspaceSave]);

  const deleteSnapshot = useCallback((id: string) => {
    commitSnapshots(snapshotsRef.current.filter((item) => item.id !== id));
  }, [commitSnapshots]);

  const saveLayoutToEditor = useCallback(async (previewDataUrl?: string) => {
    const current = diagramRef.current;
    const nextDbml = exportDbml(current);
    setDbmlText(nextDbml);
    setLoadedDiagramId(activeDiagramIdRef.current);
    lastValidDbmlRef.current = nextDbml;
    setDbmlError(undefined);
    initialRelationsRef.current = new Map(current.relations.map((relation) => [relation.id, relation]));
    const snapshot = persistCurrentDiagram({ previewDataUrl });
    createSnapshot("manual");
    setSaveStatus("saving");
    const saved = await saveWorkspaceDbml(currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name), snapshot.dbml, {
      keepalive: true, uiLayout: snapshot.uiLayout, previewDataUrl,
    });
    setSaveStatus(saved ? "saved" : "local");
    setLastSavedAt(Date.now());
    return nextDbml;
  }, [createSnapshot, persistCurrentDiagram]);

  const renameDiagram = useCallback((value: string) => {
    diagramNameRef.current = value;
    setDiagramNameState(value);

    const id = activeDiagramIdRef.current;
    const name = normalizeDiagramName(value);
    const current = diagramsRef.current.find((item) => item.id === id);
    const nextFilename = dbmlFilename(name);
    if (current?.filename && current.filename !== nextFilename) {
      pendingRenameRef.current = {
        from: pendingRenameRef.current?.from ?? current.filename,
        to: nextFilename,
        dbml: exportDbml(diagramRef.current),
        uiLayout: exportUiLayout(diagramRef.current),
      };
      if (renameTimerRef.current !== undefined) window.clearTimeout(renameTimerRef.current);
      renameTimerRef.current = window.setTimeout(async () => {
        renameTimerRef.current = undefined;
        const pending = pendingRenameRef.current;
        if (!pending) return;
        const renamed = await renameWorkspaceDbml(pending.from, pending.to);
        if (renamed) pendingRenameRef.current = undefined;
        await saveWorkspaceDbml(pending.to, pending.dbml, { uiLayout: pending.uiLayout });
        setSaveMessage(renamed ? `Renomeado para ${pending.to}` : "Não foi possível renomear o arquivo");
      }, 700);
    }
    const nextDiagrams = diagramsRef.current.map((item) =>
      item.id === id ? { ...item, name, filename: nextFilename, updatedAt: Date.now() } : item,
    );

    commitDiagramLibrary(nextDiagrams, id);
    setSaveMessage("");
  }, [commitDiagramLibrary]);

  const renameSavedDiagram = useCallback(async (id: string, value: string) => {
    const record = diagramsRef.current.find((item) => item.id === id);
    if (!record) return false;
    const name = normalizeDiagramName(value);
    const filename = dbmlFilename(name);
    if (diagramsRef.current.some((item) => item.id !== id && item.filename === filename)) {
      setSaveMessage("Já existe um esquema com esse nome");
      return false;
    }
    const previousFilename = record.filename ?? dbmlFilename(record.name);
    const renamed = await renameWorkspaceDbml(previousFilename, filename);
    if (!renamed) return false;
    const nextId = `file:${filename}`;
    const nextDiagrams = diagramsRef.current.map((item) => item.id === id
      ? { ...item, id: nextId, name, filename, updatedAt: Date.now() }
      : item);
    if (id === activeDiagramIdRef.current) {
      diagramNameRef.current = name;
      setDiagramNameState(name);
      setLoadedDiagramId(nextId);
    }
    commitDiagramLibrary(nextDiagrams, id === activeDiagramIdRef.current ? nextId : activeDiagramIdRef.current);
    await saveWorkspaceDbml(filename, record.dbml, { uiLayout: record.uiLayout, previewDataUrl: record.previewDataUrl });
    setSaveMessage(`Renomeado para ${filename}`);
    return true;
  }, [commitDiagramLibrary]);

  const deleteDiagram = useCallback(async (id: string) => {
    if (diagramsRef.current.length <= 1) return false;
    const record = diagramsRef.current.find((item) => item.id === id);
    if (!record) return false;
    await deleteWorkspaceDbml(record.filename ?? dbmlFilename(record.name));
    commitDiagramTrash([{ ...record, trashedAt: Date.now() }, ...trashedDiagramsRef.current.filter((item) => item.id !== id)]);
    const nextDiagrams = diagramsRef.current.filter((item) => item.id !== id);
    const nextActive = id === activeDiagramIdRef.current ? nextDiagrams[0] : nextDiagrams.find((item) => item.id === activeDiagramIdRef.current) ?? nextDiagrams[0];
    commitDiagramLibrary(nextDiagrams, nextActive.id);
    if (id === activeDiagramIdRef.current) {
      diagramNameRef.current = nextActive.name;
      setDiagramNameState(nextActive.name);
      setDbmlText(nextActive.dbml);
      lastValidDbmlRef.current = nextActive.dbml;
      await importDbmlText(nextActive.dbml, { resetHistory: true, uiLayout: nextActive.uiLayout });
    }
    return true;
  }, [commitDiagramLibrary, commitDiagramTrash, importDbmlText]);

  const openDiagram = useCallback(async (id: string) => {
    if (id === activeDiagramIdRef.current) return;

    const record = diagramsRef.current.find((item) => item.id === id);
    if (!record) return;

    const snapshot = persistCurrentDiagram({ silent: true });
    void saveWorkspaceDbml(currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name), snapshot.dbml, { uiLayout: snapshot.uiLayout });

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

  const saveWiki = useCallback(async (id: string, markdown: string, document?: string) => {
    const record = diagramsRef.current.find((item) => item.id === id);
    if (!record) return false;

    const nextDiagrams = diagramsRef.current.map((item) => item.id === id
      ? { ...item, wiki: markdown, wikiDocument: document, updatedAt: Date.now() }
      : item);
    commitDiagramLibrary(nextDiagrams, activeDiagramIdRef.current);
    return saveWorkspaceWiki(record.filename ?? dbmlFilename(record.name), markdown, document);
  }, [commitDiagramLibrary]);

  const createDiagram = useCallback(async () => {
    const snapshot = persistCurrentDiagram({ silent: true });
    void saveWorkspaceDbml(currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name), snapshot.dbml, {
      keepalive: true, uiLayout: snapshot.uiLayout,
    });

    const name = nextDiagramName(diagramsRef.current);
    const id = `file:${dbmlFilename(name)}`;
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
    return id;
  }, [commitDiagramLibrary, importDbmlText, persistCurrentDiagram]);

  const createDiagramFromSql = useCallback(async (sql: string) => {
    const dbml = sqlToDbml(sql);
    const snapshot = persistCurrentDiagram({ silent: true });
    void saveWorkspaceDbml(currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name), snapshot.dbml, {
      keepalive: true, uiLayout: snapshot.uiLayout,
    });

    const name = nextNamedDiagramName(diagramsRef.current, "Esquema SQL");
    const id = `file:${dbmlFilename(name)}`;
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
    return id;
  }, [commitDiagramLibrary, importDbmlText, persistCurrentDiagram]);

  const importDiagramRecord = useCallback(async (
    requestedName: string,
    dbml: string,
    extras: Pick<SavedDiagram, "uiLayout" | "previewDataUrl" | "wiki" | "wikiDocument"> = {},
  ) => {
    parseDbml(dbml);
    const snapshot = persistCurrentDiagram({ silent: true });
    void saveWorkspaceDbml(currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name), snapshot.dbml, {
      keepalive: true,
      uiLayout: snapshot.uiLayout,
    });

    const name = uniqueDiagramName(diagramsRef.current, normalizeDiagramName(requestedName));
    const filename = dbmlFilename(name);
    const id = `file:${filename}`;
    const record: SavedDiagram = { id, name, filename, dbml, updatedAt: Date.now(), ...extras };
    const nextDiagrams = [...diagramsRef.current, record];

    diagramNameRef.current = name;
    setDiagramNameState(name);
    setDbmlText(dbml);
    lastValidDbmlRef.current = dbml;
    setDbmlError(undefined);
    setSaveMessage(`Importado ${name}`);
    commitDiagramLibrary(nextDiagrams, id);
    await saveWorkspaceDbml(filename, dbml, { keepalive: true, uiLayout: extras.uiLayout, previewDataUrl: extras.previewDataUrl });
    if (extras.wiki !== undefined) await saveWorkspaceWiki(filename, extras.wiki, extras.wikiDocument);
    const loaded = await importDbmlText(dbml, { resetHistory: true, uiLayout: extras.uiLayout });
    if (!loaded) throw new Error("O DBML foi validado, mas não pôde ser carregado no editor.");
    return id;
  }, [commitDiagramLibrary, importDbmlText, persistCurrentDiagram]);

  const importDiagramDbml = useCallback(async (filename: string, dbml: string) => {
    const name = filename.replace(/\.dbml$/i, "").trim() || "DBML importado";
    return importDiagramRecord(name, dbml);
  }, [importDiagramRecord]);

  const importProjectBundle = useCallback(async (source: string) => {
    const bundle = parseProjectBundle(source);
    return importDiagramRecord(bundle.project.name, bundle.project.dbml, {
      uiLayout: bundle.project.uiLayout,
      previewDataUrl: bundle.project.previewDataUrl,
      wiki: bundle.project.wiki,
      wikiDocument: bundle.project.wikiDocument,
    });
  }, [importDiagramRecord]);

  const duplicateDiagram = useCallback(async (id: string) => {
    const record = diagramsRef.current.find((item) => item.id === id);
    if (!record) throw new Error("Projeto não encontrado.");
    return importDiagramRecord(`${record.name} cópia`, record.dbml, {
      uiLayout: record.uiLayout,
      previewDataUrl: record.previewDataUrl,
      wiki: record.wiki,
      wikiDocument: record.wikiDocument,
    });
  }, [importDiagramRecord]);

  const restoreDiagram = useCallback(async (id: string) => {
    const record = trashedDiagramsRef.current.find((item) => item.id === id);
    if (!record) return undefined;
    const name = uniqueDiagramName(diagramsRef.current, record.name);
    const filename = dbmlFilename(name);
    const restored: SavedDiagram = { ...record, id: `file:${filename}`, name, filename, updatedAt: Date.now() };
    const nextDiagrams = [...diagramsRef.current, restored];
    commitDiagramLibrary(nextDiagrams, activeDiagramIdRef.current);
    commitDiagramTrash(trashedDiagramsRef.current.filter((item) => item.id !== id));
    await saveWorkspaceDbml(filename, restored.dbml, { uiLayout: restored.uiLayout, previewDataUrl: restored.previewDataUrl });
    if (restored.wiki !== undefined) await saveWorkspaceWiki(filename, restored.wiki, restored.wikiDocument);
    return restored.id;
  }, [commitDiagramLibrary, commitDiagramTrash]);

  const purgeTrashedDiagram = useCallback((id: string) => {
    commitDiagramTrash(trashedDiagramsRef.current.filter((item) => item.id !== id));
  }, [commitDiagramTrash]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const snapshot = persistCurrentDiagram({ silent: true });
      void saveWorkspaceDbml(currentDbmlFilename(diagramsRef.current, activeDiagramIdRef.current, snapshot.name), snapshot.dbml, { uiLayout: snapshot.uiLayout });
      if (Date.now() - lastAutomaticSnapshotRef.current >= 5 * 60_000) createSnapshot("automatic");
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [createSnapshot, persistCurrentDiagram]);

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

  const addEnum = useCallback(() => {
    const existing = new Set(diagramRef.current.enums.map((item) => item.name));
    let index = diagramRef.current.enums.length + 1;
    let name = `enum_${index}`;
    while (existing.has(name)) {
      index += 1;
      name = `enum_${index}`;
    }
    const item: EnumModel = { id: uniqueId("enum"), name, values: ["value_1"], valueSettings: {} };
    updateDiagramState((current) => ({ ...current, enums: [...current.enums, item] }));
  }, [updateDiagramState]);

  const updateEnum = useCallback((id: string, patch: Partial<EnumModel>) => {
    updateDiagramState((current) => ({
      ...current,
      enums: current.enums.map((item) => item.id === id ? { ...item, ...patch, id: item.id } : item),
    }));
  }, [updateDiagramState]);

  const removeEnum = useCallback((id: string) => {
    updateDiagramState((current) => ({ ...current, enums: current.enums.filter((item) => item.id !== id) }));
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
      });
    });
  }, [updateDiagramState]);

  const moveTables = useCallback((items: Array<{ id: string; x: number; y: number }>) => {
    if (!items.length) return;
    const positions = new Map(items.map((item) => [item.id, item]));
    updateDiagramState((current) => ({
      ...current,
      tables: current.tables.map((table) => {
        const position = positions.get(table.id);
        return position ? { ...table, x: position.x, y: position.y, layoutSource: "manual" as const } : table;
      }),
    }));
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
      const orderedTables = renamedFrom && renamedTo
        ? tables.map((table) => table.id === tableId
          ? {
            ...table,
            columnOrder: table.columnOrder?.map((name) => name === renamedFrom ? renamedTo : name),
            indexes: table.indexes.map((index) => ({
              ...index,
              columns: index.columns.map((name) => name === renamedFrom ? renamedTo : name),
            })),
          }
          : table)
        : tables;

      if (!renamedFrom || !renamedTo || renamedFrom === renamedTo) {
        return enforceRelationClearance({ ...current, tables: orderedTables });
      }

      return enforceRelationClearance({
        ...current,
        tables: orderedTables,
        relations: current.relations.map((relation) => ({
          ...relation,
          fromColumn: relation.fromTable === tableId && relation.fromColumn === renamedFrom
            ? renamedTo
            : relation.fromColumn,
          fromColumns: relation.fromTable === tableId
            ? relation.fromColumns?.map((name) => name === renamedFrom ? renamedTo : name)
            : relation.fromColumns,
          toColumn: relation.toTable === tableId && relation.toColumn === renamedFrom
            ? renamedTo
            : relation.toColumn,
          toColumns: relation.toTable === tableId
            ? relation.toColumns?.map((name) => name === renamedFrom ? renamedTo : name)
            : relation.toColumns,
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
          columnOrder: table.columnOrder?.filter((name) => name !== removedName),
          indexes: table.indexes.filter((index) => !removedName || !index.columns.includes(removedName)),
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
                !(relation.toTable === tableId && relation.toColumn === removedName) &&
                !(relation.fromTable === tableId && relation.fromColumns?.includes(removedName!)) &&
                !(relation.toTable === tableId && relation.toColumns?.includes(removedName!)),
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
    updateDiagramState((current) => ({
      ...current,
      relations: current.relations.map((relation) => {
        if (relation.id !== id) return relation;
        const sideChanged = patch.fromSide !== undefined || patch.toSide !== undefined;
        const candidate = {
          ...relation,
          ...patch,
          sideMode: sideChanged ? "manual" as const : patch.sideMode ?? relation.sideMode,
        };
        if (patch.sideMode === "auto") {
          return tidyRelationGeometry(candidate, current.tables, current.visual.tableRouteMargin);
        }
        if (sideChanged) {
          return routeRelationOnChosenSides(candidate, current.tables, current.visual.tableRouteMargin);
        }
        return relationKeepsTableMargin(candidate, current.tables, current.visual.tableRouteMargin)
          ? candidate
          : tidyRelationGeometry(candidate, current.tables, current.visual.tableRouteMargin);
      }),
    }));
  }, [updateDiagramState]);

  const tidyRelation = useCallback((id: string) => {
    updateDiagramState((current) => enforceRelationClearance({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id
          ? tidyRelationGeometry({ ...relation, sideMode: "auto" }, current.tables, current.visual.tableRouteMargin)
          : relation,
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

  const insertViaPoint = useCallback((id: string, point: Point) => {
    updateDiagramState((current) => enforceRelationClearance({
      ...current,
      relations: current.relations.map((relation) => {
        if (relation.id !== id) return relation;
        const fromTable = current.tables.find((table) => table.id === relation.fromTable);
        const toTable = current.tables.find((table) => table.id === relation.toTable);
        if (!fromTable || !toTable) return relation;
        const index = findViaInsertionIndex(relation, fromTable, toTable, point);
        const viaPoints = [...relation.viaPoints];
        viaPoints.splice(index, 0, point);
        return { ...relation, route: "orthogonal" as const, viaPoints };
      }),
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
    trashedDiagrams,
    activeDiagramId,
    diagramName,
    diagramFilename: currentDbmlFilename(diagrams, activeDiagramId, diagramName),
    selected,
    exportedDbml,
    exportedTikz,
    snapToGrid,
    saveMessage,
    dbmlError,
    saveStatus,
    lastSavedAt,
    snapshots,
    canUndo: historyRef.current.past.length > 0,
    canRedo: historyRef.current.future.length > 0,
    diagramReady: loadedDiagramId === activeDiagramId,
    libraryReady,
    setDbmlText: updateDbmlText,
    setSelected,
    setSnapToGrid,
    undo,
    redo,
    beginHistoryBatch,
    endHistoryBatch,
    setDiagramName: renameDiagram,
    renameSavedDiagram,
    deleteDiagram,
    createDiagram,
    createDiagramFromSql,
    importDiagramDbml,
    importProjectBundle,
    duplicateDiagram,
    restoreDiagram,
    purgeTrashedDiagram,
    openDiagram,
    saveWiki,
    createSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    applyAutoLayout,
    saveLayoutToEditor,
    updateDiagramVisual,
    addEnum,
    updateEnum,
    removeEnum,
    addTable,
    updateTable,
    moveTable,
    moveTables,
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
    insertViaPoint,
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

function uniqueDiagramName(diagrams: SavedDiagram[], requested: string): string {
  const names = new Set(diagrams.map((item) => item.name.toLocaleLowerCase()));
  if (!names.has(requested.toLocaleLowerCase())) return requested;
  let index = 2;
  let candidate = `${requested} ${index}`;
  while (names.has(candidate.toLocaleLowerCase())) {
    index += 1;
    candidate = `${requested} ${index}`;
  }
  return candidate;
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

  if (relation.sideMode === "manual") {
    if (relation.viaPoints.length && relationKeepsTableMargin(relation, tables, margin)) return relation;
    return routeRelationOnChosenSides(relation, tables, margin);
  }

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

function routeRelationOnChosenSides(
  relation: RelationModel,
  tables: TableModel[],
  margin = defaultDiagramVisual.tableRouteMargin,
): RelationModel {
  const fromTable = tables.find((table) => table.id === relation.fromTable);
  const toTable = tables.find((table) => table.id === relation.toTable);
  if (!fromTable || !toTable) return relation;
  const fromSide: Direction = relation.fromSide === "west" ? "west" : "east";
  const toSide: Direction = relation.toSide === "west" ? "west" : "east";
  const route = organizeRelationRouteOnFixedSides(
    relation,
    fromTable,
    toTable,
    tables,
    fromSide,
    toSide,
    margin,
  );

  return {
    ...relation,
    fromSide: route.fromSide,
    toSide: route.toSide,
    sideMode: "manual",
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
