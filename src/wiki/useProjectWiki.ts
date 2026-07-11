import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramController } from "../editor/types";

export type WikiSaveState = "loading" | "saved" | "dirty" | "saving" | "local";

export function useProjectWiki(controller: DiagramController, projectId: string | undefined) {
  const record = controller.diagrams.find((item) => item.id === projectId);
  const [markdown, setMarkdownState] = useState("");
  const [saveState, setSaveState] = useState<WikiSaveState>("loading");
  const [lastSavedAt, setLastSavedAt] = useState<number>();
  const initializedIdRef = useRef<string>();
  const markdownRef = useRef("");
  const lastSavedRef = useRef("");
  const dirtyRef = useRef(false);
  const saveWiki = controller.saveWiki;
  const ready = Boolean(record && projectId && controller.activeDiagramId === projectId);

  useEffect(() => {
    if (!record || !projectId || controller.activeDiagramId !== projectId) return;

    if (initializedIdRef.current !== projectId) {
      const initial = record.wiki ?? "";
      initializedIdRef.current = projectId;
      markdownRef.current = initial;
      lastSavedRef.current = initial;
      dirtyRef.current = false;
      setMarkdownState(initial);
      setSaveState("saved");
      return;
    }

    if (!dirtyRef.current && record.wiki !== undefined && record.wiki !== lastSavedRef.current) {
      markdownRef.current = record.wiki;
      lastSavedRef.current = record.wiki;
      setMarkdownState(record.wiki);
      setSaveState("saved");
    }
  }, [controller.activeDiagramId, projectId, record]);

  const setMarkdown = useCallback((value: string) => {
    markdownRef.current = value;
    dirtyRef.current = value !== lastSavedRef.current;
    setMarkdownState(value);
    setSaveState(dirtyRef.current ? "dirty" : "saved");
  }, []);

  const save = useCallback(async () => {
    if (!projectId || initializedIdRef.current !== projectId) return undefined;
    if (!dirtyRef.current) return true;

    setSaveState("saving");
    const value = markdownRef.current;
    const workspaceSaved = await saveWiki(projectId, value);
    lastSavedRef.current = value;
    dirtyRef.current = false;
    setLastSavedAt(Date.now());
    setSaveState(workspaceSaved ? "saved" : "local");
    return workspaceSaved;
  }, [projectId, saveWiki]);

  useEffect(() => {
    if (!ready || !dirtyRef.current) return;
    const timer = window.setTimeout(() => { void save(); }, 900);
    return () => window.clearTimeout(timer);
  }, [markdown, ready, save]);

  return {
    markdown,
    setMarkdown,
    save,
    saveState,
    lastSavedAt,
    ready,
    record,
  };
}
