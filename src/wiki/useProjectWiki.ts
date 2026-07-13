import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramController } from "../editor/types";
import {
  parseWikiDocument,
  reconcileWikiDocument,
  serializeWikiDocument,
  type WikiDocument,
  type WikiReconcileResult,
} from "./wikiDocument";
import { generateWikiMarkdownFromDocument, migrateWikiMarkdown } from "./wikiDocumentMarkdown";
import { clearWikiDraft, readWikiDraft, writeWikiDraft } from "./wikiDraft";

export type WikiSaveState = "loading" | "saved" | "dirty" | "saving" | "local";

export function useProjectWiki(
  controller: DiagramController,
  projectId: string | undefined,
  projectName: string,
) {
  const record = controller.diagrams.find((item) => item.id === projectId);
  const [document, setDocumentState] = useState<WikiDocument>();
  const [markdown, setMarkdownState] = useState("");
  const [saveState, setSaveState] = useState<WikiSaveState>("loading");
  const [lastSavedAt, setLastSavedAt] = useState<number>();
  const [syncResult, setSyncResult] = useState<WikiReconcileResult>();
  const initializedIdRef = useRef<string>();
  const diagramFingerprintRef = useRef("");
  const documentRef = useRef<WikiDocument>();
  const documentJsonRef = useRef("");
  const markdownRef = useRef("");
  const lastSavedFingerprintRef = useRef("");
  const dirtyRef = useRef(false);
  const saveChainRef = useRef<Promise<boolean>>();
  const lastWorkspaceResultRef = useRef(true);
  const draftTimerRef = useRef<number>();
  const pendingDraftRef = useRef<{ key: string; markdown: string; document: string }>();
  const saveWiki = controller.saveWiki;
  const draftKey = record?.filename ?? projectId;
  const ready = Boolean(
    document && record && projectId && controller.activeDiagramId === projectId && controller.diagramReady,
  );

  const flushPendingDraft = useCallback(() => {
    if (draftTimerRef.current !== undefined) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = undefined;
    const pending = pendingDraftRef.current;
    pendingDraftRef.current = undefined;
    if (pending) writeWikiDraft(pending.key, pending.markdown, pending.document);
  }, []);

  const discardPendingDraft = useCallback(() => {
    if (draftTimerRef.current !== undefined) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = undefined;
    pendingDraftRef.current = undefined;
  }, []);

  const scheduleDraft = useCallback((key: string, nextMarkdown: string, nextDocument: string) => {
    pendingDraftRef.current = { key, markdown: nextMarkdown, document: nextDocument };
    if (draftTimerRef.current !== undefined) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(flushPendingDraft, 140);
  }, [flushPendingDraft]);

  useEffect(() => {
    window.addEventListener("pagehide", flushPendingDraft);
    return () => {
      window.removeEventListener("pagehide", flushPendingDraft);
      flushPendingDraft();
    };
  }, [flushPendingDraft]);

  useEffect(() => {
    if (!record || !projectId || controller.activeDiagramId !== projectId || !controller.diagramReady) return;

    if (initializedIdRef.current !== projectId) {
      const savedMarkdown = record.wiki ?? "";
      const savedDocument = record.wikiDocument ?? "";
      const draft = readWikiDraft(draftKey ?? projectId);
      const sourceMarkdown = draft?.markdown ?? savedMarkdown;
      const parsed = parseWikiDocument(draft?.document ?? savedDocument) ??
        migrateWikiMarkdown(sourceMarkdown, controller.diagram, projectName);
      const reconciled = reconcileWikiDocument(parsed, controller.diagram, projectName);
      const nextDocumentJson = serializeWikiDocument(reconciled.document);
      const nextMarkdown = generateWikiMarkdownFromDocument(controller.diagram, reconciled.document);

      initializedIdRef.current = projectId;
      diagramFingerprintRef.current = diagramFingerprint(controller.diagram);
      documentRef.current = reconciled.document;
      documentJsonRef.current = nextDocumentJson;
      markdownRef.current = nextMarkdown;
      lastSavedFingerprintRef.current = fingerprint(savedMarkdown, savedDocument);
      dirtyRef.current = Boolean(draft) || fingerprint(nextMarkdown, nextDocumentJson) !== lastSavedFingerprintRef.current;
      lastWorkspaceResultRef.current = !draft;
      setDocumentState(reconciled.document);
      setMarkdownState(nextMarkdown);
      setSyncResult(reconciled);
      setSaveState(dirtyRef.current ? "dirty" : "saved");
      return;
    }

    const nextDiagramFingerprint = diagramFingerprint(controller.diagram);
    const schemaChanged = nextDiagramFingerprint !== diagramFingerprintRef.current;
    const remoteFingerprint = fingerprint(record.wiki ?? "", record.wikiDocument ?? "");
    const adoptRemote = !dirtyRef.current && remoteFingerprint !== lastSavedFingerprintRef.current;
    if (schemaChanged || adoptRemote) {
      const source = adoptRemote
        ? parseWikiDocument(record.wikiDocument) ??
          migrateWikiMarkdown(record.wiki ?? "", controller.diagram, projectName)
        : documentRef.current;
      if (!source) return;
      const reconciled = reconcileWikiDocument(source, controller.diagram, projectName);
      const nextDocumentJson = serializeWikiDocument(reconciled.document);
      const nextMarkdown = generateWikiMarkdownFromDocument(controller.diagram, reconciled.document);
      if (adoptRemote) {
        lastSavedFingerprintRef.current = remoteFingerprint;
        lastWorkspaceResultRef.current = true;
      }
      diagramFingerprintRef.current = nextDiagramFingerprint;
      documentRef.current = reconciled.document;
      documentJsonRef.current = nextDocumentJson;
      markdownRef.current = nextMarkdown;
      dirtyRef.current = fingerprint(nextMarkdown, nextDocumentJson) !== lastSavedFingerprintRef.current;
      setDocumentState(reconciled.document);
      setMarkdownState(nextMarkdown);
      setSyncResult(reconciled);
      setSaveState(dirtyRef.current ? "dirty" : "saved");
    }
  }, [controller.activeDiagramId, controller.diagram, controller.diagramReady, draftKey, projectId, projectName, record]);

  const updateDocument = useCallback((
    updater: WikiDocument | ((current: WikiDocument) => WikiDocument),
  ) => {
    const current = documentRef.current;
    if (!current) return;
    const requested = typeof updater === "function" ? updater(current) : updater;
    const reconciled = reconcileWikiDocument(requested, controller.diagram, projectName);
    const next = reconciled.document;
    const nextDocumentJson = serializeWikiDocument(next);
    const nextMarkdown = generateWikiMarkdownFromDocument(controller.diagram, next);
    documentRef.current = next;
    documentJsonRef.current = nextDocumentJson;
    markdownRef.current = nextMarkdown;
    dirtyRef.current = fingerprint(nextMarkdown, nextDocumentJson) !== lastSavedFingerprintRef.current;
    setDocumentState(next);
    setMarkdownState(nextMarkdown);
    setSaveState(dirtyRef.current ? "dirty" : "saved");
    if (draftKey) {
      if (dirtyRef.current) scheduleDraft(draftKey, nextMarkdown, nextDocumentJson);
      else {
        discardPendingDraft();
        clearWikiDraft(draftKey);
      }
    }
  }, [controller.diagram, discardPendingDraft, draftKey, projectName, scheduleDraft]);

  const save = useCallback((): Promise<boolean | undefined> => {
    if (!projectId || initializedIdRef.current !== projectId) return Promise.resolve(undefined);
    const targetProjectId = projectId;
    const targetDraftKey = draftKey;
    const requestedMarkdown = markdownRef.current;
    const requestedDocument = documentJsonRef.current;

    const persistSnapshot = async () => {
      const nextFingerprint = fingerprint(requestedMarkdown, requestedDocument);
      if (initializedIdRef.current === targetProjectId &&
        nextFingerprint === lastSavedFingerprintRef.current && lastWorkspaceResultRef.current) return true;

      if (initializedIdRef.current === targetProjectId) setSaveState("saving");
      let workspaceSaved = false;
      try {
        workspaceSaved = await saveWiki(targetProjectId, requestedMarkdown, requestedDocument);
      } catch {
        workspaceSaved = false;
      }
      if (initializedIdRef.current !== targetProjectId) {
        if (workspaceSaved && targetDraftKey) clearWikiDraft(targetDraftKey);
        return workspaceSaved;
      }
      lastWorkspaceResultRef.current = workspaceSaved;
      lastSavedFingerprintRef.current = nextFingerprint;
      dirtyRef.current = fingerprint(markdownRef.current, documentJsonRef.current) !== nextFingerprint;
      setLastSavedAt(Date.now());
      setSaveState(dirtyRef.current ? "dirty" : workspaceSaved ? "saved" : "local");
      if (workspaceSaved && !dirtyRef.current && targetDraftKey) {
        discardPendingDraft();
        clearWikiDraft(targetDraftKey);
      } else if (targetDraftKey) {
        scheduleDraft(targetDraftKey, markdownRef.current, documentJsonRef.current);
      }
      return workspaceSaved;
    };

    const previous = saveChainRef.current;
    const next = previous ? previous.then(persistSnapshot, persistSnapshot) : persistSnapshot();
    saveChainRef.current = next;
    const clearChain = () => { if (saveChainRef.current === next) saveChainRef.current = undefined; };
    void next.then(clearChain, clearChain);
    return next;
  }, [discardPendingDraft, draftKey, projectId, saveWiki, scheduleDraft]);

  useEffect(() => {
    if (!ready || !dirtyRef.current) return;
    const timer = window.setTimeout(() => { void save(); }, 900);
    return () => window.clearTimeout(timer);
  }, [document, ready, save]);

  return {
    document,
    markdown,
    updateDocument,
    save,
    saveState,
    lastSavedAt,
    ready,
    record,
    syncResult,
    dismissSyncResult: () => setSyncResult(undefined),
  };
}

function fingerprint(markdown: string, document: string): string {
  return `${document.length}:${document}\u0000${markdown}`;
}

function diagramFingerprint(diagram: DiagramController["diagram"]): string {
  return JSON.stringify({
    tables: diagram.tables.map((table) => ({
      id: table.id,
      name: table.name,
      order: table.columnOrder,
      columns: table.columns.map((column) => ({
        id: column.id,
        name: column.name,
        type: column.type,
        nullable: column.nullable,
        primaryKey: column.primaryKey,
        foreignKey: column.foreignKey,
        unique: column.unique,
        defaultValue: column.defaultValue,
      })),
      indexes: table.indexes,
    })),
    relations: diagram.relations.map((relation) => ({
      id: relation.id,
      fromTable: relation.fromTable,
      fromColumn: relation.fromColumn,
      toTable: relation.toTable,
      toColumn: relation.toColumn,
      fromCardinality: relation.fromCardinality,
      toCardinality: relation.toCardinality,
      label: relation.label,
    })),
    enums: diagram.enums,
  });
}
