import { Check, Cloud, Download, Eye, FileCode2, FileText, HardDrive, LoaderCircle, Save, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { DiagramController } from "../../editor/types";
import type { TableModel } from "../../model/types";
import { downloadText } from "../../utils/download";
import { slugify } from "../../utils/id";
import { downloadWikiHtml, exportWikiPdf } from "../../wiki/wikiExport";
import { WikiArchiveView } from "../../wiki/components/WikiArchiveView";
import {
  WikiBuilderSidebar,
  type WikiBuilderSelection,
} from "../../wiki/components/WikiBuilderSidebar";
import { WikiCustomSectionForm } from "../../wiki/components/WikiCustomSectionForm";
import { WikiGeneralForm } from "../../wiki/components/WikiGeneralForm";
import { WikiPreviewDialog } from "../../wiki/components/WikiPreviewDialog";
import { WikiTableForm } from "../../wiki/components/WikiTableForm";
import { useProjectWiki, type WikiSaveState } from "../../wiki/useProjectWiki";
import {
  createWikiCustomSection,
  getWikiCompletion,
  type WikiDocument,
  type WikiTableDocumentation,
} from "../../wiki/wikiDocument";
import "../../wiki/wiki.css";
import { ProjectHeader } from "../components/ProjectHeader";

export function WikiPage({ controller }: { controller: DiagramController }) {
  const navigate = useNavigate();
  const { diagramId } = useParams();
  const projectId = diagramId ? decodeURIComponent(diagramId) : undefined;
  const routeRecord = controller.diagrams.find((item) => item.id === projectId);
  const projectName = routeRecord?.name ?? controller.diagramName;
  const wiki = useProjectWiki(controller, projectId, projectName);
  const [selection, setSelection] = useState<WikiBuilderSelection>({ kind: "overview" });
  const [previewOpen, setPreviewOpen] = useState(false);
  const completion = useMemo(
    () => wiki.document ? getWikiCompletion(wiki.document) : { completed: 0, total: 0, percentage: 0 },
    [wiki.document],
  );
  const wordCount = useMemo(() => countWords(wiki.markdown), [wiki.markdown]);

  useEffect(() => {
    if (projectId && projectId !== controller.activeDiagramId) {
      void controller.openDiagram(projectId);
    }
  }, [controller, projectId]);

  useEffect(() => {
    if (!projectId || !controller.libraryReady || controller.diagrams.some((item) => item.id === projectId)) return;
    toast.error("Este projeto não está mais disponível");
    navigate("/", { replace: true });
  }, [controller.diagrams, controller.libraryReady, navigate, projectId]);

  useEffect(() => {
    const document = wiki.document;
    if (!document) return;
    if (selection.kind === "table" && !document.tables.some((table) => table.id === selection.id)) {
      setSelection({ kind: "overview" });
    }
    if (selection.kind === "custom" && !document.customSections.some((section) => section.id === selection.id)) {
      setSelection({ kind: "overview" });
    }
    if (selection.kind === "archive" && !hasArchivedContent(document)) {
      setSelection({ kind: "overview" });
    }
  }, [selection, wiki.document]);

  const save = useCallback(async (notify = true) => {
    const result = await wiki.save();
    if (!notify || result === undefined) return result;
    if (result) toast.success("Wiki salva no projeto");
    else toast.warning("Wiki salva neste navegador; a pasta do projeto não está disponível");
    return result;
  }, [wiki.save]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void save();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  const leaveWiki = async (destination: "menu" | "diagram") => {
    await save(false);
    if (destination === "menu") navigate("/");
    else if (projectId) navigate(`/editor/${encodeURIComponent(projectId)}`);
  };

  const download = useCallback(() => {
    if (downloadText(`${slugify(projectName)}-wiki.md`, wiki.markdown)) toast.success("Wiki baixada em Markdown");
    else toast.warning("A Wiki ainda não possui conteúdo para baixar");
  }, [projectName, wiki.markdown]);

  const downloadHtml = useCallback(() => {
    downloadWikiHtml(`${slugify(projectName)}-wiki.html`, wiki.document?.project.title || projectName, wiki.markdown);
    toast.success("Wiki exportada em HTML");
  }, [projectName, wiki.document?.project.title, wiki.markdown]);

  const downloadPdf = useCallback(async () => {
    await exportWikiPdf(`${slugify(projectName)}-wiki.pdf`, wiki.document?.project.title || projectName, wiki.markdown);
    toast.success("Wiki exportada em PDF");
  }, [projectName, wiki.document?.project.title, wiki.markdown]);

  const copyMarkdown = useCallback(async () => {
    try {
      await copyText(wiki.markdown);
      toast.success("Markdown copiado");
      return true;
    } catch {
      toast.error("Não foi possível copiar o Markdown");
      return false;
    }
  }, [wiki.markdown]);

  const updateProjectField = useCallback((field: keyof WikiDocument["project"], value: string) => {
    wiki.updateDocument((current) => ({
      ...current,
      project: { ...current.project, [field]: value },
    }));
  }, [wiki.updateDocument]);

  const updateOption = useCallback((field: keyof WikiDocument["options"], value: boolean) => {
    wiki.updateDocument((current) => ({
      ...current,
      options: { ...current.options, [field]: value },
    }));
  }, [wiki.updateDocument]);

  const updateTableDocumentation = useCallback((next: WikiTableDocumentation) => {
    wiki.updateDocument((current) => ({
      ...current,
      tables: current.tables.map((table) => table.id === next.id ? next : table),
    }));
  }, [wiki.updateDocument]);

  const addCustomSection = useCallback(() => {
    const section = createWikiCustomSection();
    wiki.updateDocument((current) => ({
      ...current,
      customSections: [...current.customSections, section],
    }));
    setSelection({ kind: "custom", id: section.id });
  }, [wiki.updateDocument]);

  const updateCustomSection = useCallback((id: string, patch: WikiDocument["customSections"][number]) => {
    wiki.updateDocument((current) => ({
      ...current,
      customSections: current.customSections.map((section) => section.id === id ? patch : section),
    }));
  }, [wiki.updateDocument]);

  const moveCustomSection = useCallback((id: string, direction: -1 | 1) => {
    wiki.updateDocument((current) => {
      const index = current.customSections.findIndex((section) => section.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.customSections.length) return current;
      const sections = [...current.customSections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...current, customSections: sections };
    });
  }, [wiki.updateDocument]);

  const deleteCustomSection = useCallback((id: string) => {
    if (!window.confirm("Excluir esta seção personalizada da Wiki?")) return;
    wiki.updateDocument((current) => ({
      ...current,
      customSections: current.customSections.filter((section) => section.id !== id),
    }));
    setSelection({ kind: "overview" });
    toast.success("Seção removida");
  }, [wiki.updateDocument]);

  const closePreview = useCallback(() => setPreviewOpen(false), []);
  const selectedTable = getSelectedTable(selection, wiki.document, controller.diagram.tables);
  const selectedCustom = selection.kind === "custom"
    ? wiki.document?.customSections.find((section) => section.id === selection.id)
    : undefined;
  const selectedCustomIndex = selectedCustom && wiki.document
    ? wiki.document.customSections.findIndex((section) => section.id === selectedCustom.id)
    : -1;

  return (
    <div className="wiki-screen">
      <ProjectHeader
        projectName={projectName}
        projectFilename={wiki.record?.filename}
        activeSection="wiki"
        onMenu={() => void leaveWiki("menu")}
        onSectionChange={(section) => { if (section === "diagram") void leaveWiki("diagram"); }}
        actions={(
          <>
            <WikiSaveIndicator state={wiki.saveState} lastSavedAt={wiki.lastSavedAt} />
            <button type="button" className="secondary-button" onClick={() => setPreviewOpen(true)} disabled={!wiki.ready}>
              <Eye size={16} />Visualizar
            </button>
            <button type="button" onClick={() => void save()} disabled={!wiki.ready || wiki.saveState === "saving"}>
              <Save size={16} />Salvar
            </button>
            <button type="button" className="secondary-button" onClick={download} disabled={!wiki.ready}>
              <Download size={16} />Baixar .md
            </button>
            <button type="button" className="secondary-button" onClick={downloadHtml} disabled={!wiki.ready}>
              <FileCode2 size={16} />HTML
            </button>
            <button type="button" className="secondary-button" onClick={() => void downloadPdf()} disabled={!wiki.ready}>
              <FileText size={16} />PDF
            </button>
          </>
        )}
      />

      <div className="wiki-context-bar wiki-builder-context">
        <div>
          <strong>Construtor da Wiki</strong>
          <span>{wordCount} palavra{wordCount === 1 ? "" : "s"} no Markdown gerado</span>
        </div>
        <div className="wiki-builder-completion" title={`${completion.completed} de ${completion.total} itens documentados`}>
          <span>{completion.percentage}% documentado</span>
          <div className="wiki-builder-progress" aria-hidden="true"><span style={{ width: `${completion.percentage}%` }} /></div>
        </div>
      </div>

      {wiki.document ? (
        <main className="wiki-builder-workspace">
          <WikiBuilderSidebar
            document={wiki.document}
            selection={selection}
            onSelect={setSelection}
            onAddCustomSection={addCustomSection}
          />
          <section className="wiki-builder-main" aria-live="polite">
            {wiki.syncResult && hasSyncChanges(wiki.syncResult) && (
              <div className="wiki-builder-sync-banner">
                <Sparkles size={17} />
                <div><strong>Wiki sincronizada com o diagrama</strong><span>{describeSyncChanges(wiki.syncResult)}</span></div>
                <button type="button" className="icon-button" aria-label="Dispensar aviso" onClick={wiki.dismissSyncResult}><X size={15} /></button>
              </div>
            )}
            <div className="wiki-builder-main-scroll">
              {(selection.kind === "overview" || selection.kind === "database" || selection.kind === "conclusion") && (
                <WikiGeneralForm
                  section={selection.kind}
                  project={wiki.document.project}
                  options={wiki.document.options}
                  diagram={controller.diagram}
                  onProjectFieldChange={updateProjectField}
                  onOptionChange={updateOption}
                />
              )}
              {selection.kind === "table" && selectedTable && (
                <WikiTableForm
                  diagram={controller.diagram}
                  table={selectedTable.table}
                  documentation={selectedTable.documentation}
                  onChange={updateTableDocumentation}
                  onEditDiagram={() => void leaveWiki("diagram")}
                />
              )}
              {selection.kind === "custom" && selectedCustom && selectedCustomIndex >= 0 && (
                <WikiCustomSectionForm
                  section={selectedCustom}
                  index={selectedCustomIndex}
                  total={wiki.document.customSections.length}
                  onChange={(next) => updateCustomSection(selectedCustom.id, next)}
                  onMove={(direction) => moveCustomSection(selectedCustom.id, direction)}
                  onDelete={() => deleteCustomSection(selectedCustom.id)}
                />
              )}
              {selection.kind === "archive" && <WikiArchiveView document={wiki.document} />}
            </div>
          </section>
          {!wiki.ready && <div className="wiki-loading"><LoaderCircle size={22} className="is-spinning" />Sincronizando a Wiki com este projeto…</div>}
        </main>
      ) : (
        <main className="wiki-builder-workspace wiki-builder-loading-state">
          <div className="wiki-loading"><LoaderCircle size={22} className="is-spinning" />Preparando o construtor da Wiki…</div>
        </main>
      )}

      <WikiPreviewDialog
        open={previewOpen}
        title={wiki.document?.project.title || projectName}
        markdown={wiki.markdown}
        onClose={closePreview}
        onCopy={copyMarkdown}
        onDownload={download}
      />
    </div>
  );
}

function WikiSaveIndicator({ state, lastSavedAt }: { state: WikiSaveState; lastSavedAt?: number }) {
  const content = state === "loading"
    ? { icon: LoaderCircle, text: "Carregando" }
    : state === "saving"
      ? { icon: LoaderCircle, text: "Salvando" }
      : state === "dirty"
        ? { icon: Cloud, text: "Alterações pendentes" }
        : state === "local"
          ? { icon: HardDrive, text: "Salvo no navegador" }
          : { icon: Check, text: lastSavedAt ? `Salvo ${formatTime(lastSavedAt)}` : "Salvo" };
  const Icon = content.icon;
  return <span className={`wiki-save-state is-${state}`} title={content.text}><Icon size={14} className={state === "saving" || state === "loading" ? "is-spinning" : undefined} />{content.text}</span>;
}

function getSelectedTable(
  selection: WikiBuilderSelection,
  document: WikiDocument | undefined,
  tables: TableModel[],
): { documentation: WikiTableDocumentation; table: TableModel } | undefined {
  if (selection.kind !== "table" || !document) return undefined;
  const documentation = document.tables.find((item) => item.id === selection.id);
  if (!documentation) return undefined;
  const table = tables.find((item) => item.id === documentation.binding.sourceId) ??
    tables.find((item) => item.name === documentation.binding.name);
  return table ? { documentation, table } : undefined;
}

function hasArchivedContent(document: WikiDocument): boolean {
  return document.archivedTables.length > 0 || document.tables.some((table) => table.archivedFields.length > 0);
}

function hasSyncChanges(result: NonNullable<ReturnType<typeof useProjectWiki>["syncResult"]>): boolean {
  return result.addedTables + result.archivedTables + result.addedFields + result.archivedFields > 0;
}

function describeSyncChanges(result: NonNullable<ReturnType<typeof useProjectWiki>["syncResult"]>): string {
  const changes = [
    result.addedTables && `${result.addedTables} tabela(s) adicionada(s)`,
    result.archivedTables && `${result.archivedTables} tabela(s) arquivada(s)`,
    result.addedFields && `${result.addedFields} campo(s) adicionado(s)`,
    result.archivedFields && `${result.archivedFields} campo(s) arquivado(s)`,
  ].filter(Boolean);
  return changes.join(" · ");
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

function countWords(markdown: string): number {
  return markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
