import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultDiagramVisual,
  defaultGroupVisual,
  defaultRelationVisual,
  getTableMinHeight,
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
  setDbmlText: (value: string) => void;
  setSelected: (selection: Selection | undefined) => void;
  setSnapToGrid: (value: boolean) => void;
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

export function useDiagramController(): DiagramController {
  const [dbmlText, setDbmlText] = useState(() => localStorage.getItem(SAVED_DBML_KEY) ?? demoDbml);
  const [diagram, setDiagram] = useState<DiagramModel>(emptyDiagram);
  const [selected, setSelected] = useState<Selection | undefined>();
  const [exportedDbml, setExportedDbml] = useState("");
  const [exportedTikz, setExportedTikz] = useState("");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");
  const initialRelationsRef = useRef(new Map<string, RelationModel>());

  const updateDbmlText = useCallback((value: string) => {
    setDbmlText(value);
    setSaveMessage("");
  }, []);

  const importDbmlText = useCallback(async (text: string) => {
    const parsed = parseDbml(text);
    const { layoutDiagram } = await import("../layout/autoLayout");
    const laidOut = await layoutDiagram(parsed, { preserveManual: true });
    initialRelationsRef.current = new Map(laidOut.relations.map((relation) => [relation.id, relation]));
    setDiagram(laidOut);
    setSelected(undefined);
  }, []);

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

      if (!cancelled) {
        setExportedDbml(exportDbml(diagram));
        setExportedTikz(exportTikz(diagram));
      }
    }

    void updateExports();

    return () => {
      cancelled = true;
    };
  }, [diagram]);


  const importFromEditor = useCallback(async () => {
    await importDbmlText(dbmlText);
    setSaveMessage("");
  }, [dbmlText, importDbmlText]);

  const applyAutoLayout = useCallback(async () => {
    const { layoutDiagram } = await import("../layout/autoLayout");
    const laidOut = await layoutDiagram(diagram, { preserveManual: false });
    setSaveMessage("");
    setDiagram(laidOut);
  }, [diagram]);

  const saveLayoutToEditor = useCallback(async () => {
    const { exportDbml } = await import("../exporter/dbmlExporter");
    const nextDbml = exportDbml(diagram);
    setDbmlText(nextDbml);
    localStorage.setItem(SAVED_DBML_KEY, nextDbml);
    initialRelationsRef.current = new Map(diagram.relations.map((relation) => [relation.id, relation]));
    setSaveMessage(`Salvo ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  }, [diagram]);

  const loadDemo = useCallback(async () => {
    setDbmlText(demoDbml);
    localStorage.removeItem(SAVED_DBML_KEY);
    setSaveMessage("");
    await importDbmlText(demoDbml);
  }, [importDbmlText]);

  const updateDiagramVisual = useCallback((patch: Partial<DiagramModel["visual"]>) => {
    setSaveMessage("");
    setDiagram((current) => ({
      ...current,
      visual: { ...current.visual, ...patch },
    }));
  }, []);

  const updateTable = useCallback((id: string, patch: Partial<TableModel>) => {
    setSaveMessage("");
    setDiagram((current) => ({
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
  }, []);

  const moveTable = useCallback((id: string, dx: number, dy: number) => {
    updateTable(id, {
      x: (diagram.tables.find((table) => table.id === id)?.x ?? 0) + dx,
      y: (diagram.tables.find((table) => table.id === id)?.y ?? 0) + dy,
      layoutSource: "manual",
    });
  }, [diagram.tables, updateTable]);

  const resizeTable = useCallback((id: string, width: number, height: number) => {
    setSaveMessage("");
    setDiagram((current) => ({
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
  }, []);

  const updateRelation = useCallback((id: string, patch: Partial<RelationModel>) => {
    setSaveMessage("");
    setDiagram((current) => ({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id ? { ...relation, ...patch } : relation,
      ),
    }));
  }, []);

  const resetRelation = useCallback((id: string) => {
    setSaveMessage("");
    setDiagram((current) => ({
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
  }, []);

  const addViaPoint = useCallback((id: string, point: Point) => {
    setSaveMessage("");
    setDiagram((current) => ({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id ? { ...relation, viaPoints: [...relation.viaPoints, point] } : relation,
      ),
    }));
  }, []);

  const updateViaPoint = useCallback((id: string, index: number, point: Point) => {
    setSaveMessage("");
    setDiagram((current) => ({
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
  }, []);

  const removeViaPoint = useCallback((id: string, index: number) => {
    setSaveMessage("");
    setDiagram((current) => ({
      ...current,
      relations: current.relations.map((relation) =>
        relation.id === id
          ? { ...relation, viaPoints: relation.viaPoints.filter((_, viaIndex) => viaIndex !== index) }
          : relation,
      ),
    }));
  }, []);

  const updateGroup = useCallback((id: string, patch: Partial<GroupModel>) => {
    setSaveMessage("");
    setDiagram((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
    }));
  }, []);

  const moveGroup = useCallback((id: string, dx: number, dy: number) => {
    setSaveMessage("");
    setDiagram((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === id ? { ...group, x: group.x + dx, y: group.y + dy } : group,
      ),
    }));
  }, []);

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

    setSaveMessage("");
    setDiagram((current) => ({ ...current, groups: [...current.groups, group] }));
    setSelected({ type: "group", id });
  }, [diagram.tables, selected]);

  const sendGroupBackward = useCallback((id: string) => {
    setDiagram((current) => {
      const index = current.groups.findIndex((group) => group.id === id);
      if (index <= 0) return current;
      setSaveMessage("");
      const groups = [...current.groups];
      const [group] = groups.splice(index, 1);
      groups.splice(index - 1, 0, group);
      return { ...current, groups };
    });
  }, []);

  const bringGroupForward = useCallback((id: string) => {
    setDiagram((current) => {
      const index = current.groups.findIndex((group) => group.id === id);
      if (index < 0 || index === current.groups.length - 1) return current;
      setSaveMessage("");
      const groups = [...current.groups];
      const [group] = groups.splice(index, 1);
      groups.splice(index + 1, 0, group);
      return { ...current, groups };
    });
  }, []);

  return {
    dbmlText,
    diagram,
    selected,
    exportedDbml,
    exportedTikz,
    snapToGrid,
    saveMessage,
    setDbmlText: updateDbmlText,
    setSelected,
    setSnapToGrid,
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
