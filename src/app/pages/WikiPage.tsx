import { Check, Cloud, Download, HardDrive, LoaderCircle, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { DiagramController } from "../../editor/types";
import { downloadText } from "../../utils/download";
import { slugify } from "../../utils/id";
import { WikiAssistant } from "../../wiki/components/WikiAssistant";
import { WikiEditor } from "../../wiki/components/WikiEditor";
import { WikiPreview } from "../../wiki/components/WikiPreview";
import { applyMarkdownEdit, type MarkdownEditAction } from "../../wiki/markdownEditing";
import { extractMarkdownHeadings } from "../../wiki/markdownParser";
import { generateWikiMarkdown, updateDataDictionaryMarkdown } from "../../wiki/wikiGenerator";
import { useProjectWiki, type WikiSaveState } from "../../wiki/useProjectWiki";
import "../../wiki/wiki.css";
import { ProjectHeader } from "../components/ProjectHeader";

type WikiView = "split" | "editor" | "preview";

export function WikiPage({ controller }: { controller: DiagramController }) {
  const navigate = useNavigate();
  const { diagramId } = useParams();
  const projectId = diagramId ? decodeURIComponent(diagramId) : undefined;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState<WikiView>("split");
  const wiki = useProjectWiki(controller, projectId);
  const projectName = wiki.record?.name ?? controller.diagramName;
  const headings = useMemo(() => extractMarkdownHeadings(wiki.markdown), [wiki.markdown]);
  const wordCount = useMemo(() => countWords(wiki.markdown), [wiki.markdown]);

  useEffect(() => {
    if (projectId && projectId !== controller.activeDiagramId) {
      void controller.openDiagram(projectId);
    }
  }, [controller, projectId]);

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

  const applyFormat = (action: MarkdownEditAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = applyMarkdownEdit(wiki.markdown, textarea.selectionStart, textarea.selectionEnd, action);
    wiki.setMarkdown(result.value);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const generateStructure = () => {
    if (!wiki.ready) return;
    if (wiki.markdown.trim() && !window.confirm("Gerar uma nova estrutura substituirá o conteúdo atual da wiki. Continuar?")) return;
    wiki.setMarkdown(generateWikiMarkdown(controller.diagram, { projectName }));
    toast.success("Estrutura gerada a partir do esquema");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const refreshDictionary = () => {
    try {
      wiki.setMarkdown(updateDataDictionaryMarkdown(wiki.markdown, controller.diagram));
      toast.success("Dicionário atualizado sem alterar as outras seções");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o dicionário");
    }
  };

  const startBlank = () => {
    wiki.setMarkdown(`# ${projectName}\n\n`);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  };

  const download = () => {
    if (downloadText(`${slugify(projectName)}-wiki.md`, wiki.markdown)) toast.success("Wiki baixada em Markdown");
    else toast.warning("Escreva ou gere algum conteúdo antes de baixar");
  };

  const goToHeading = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    const heading = headings.find((item) => item.id === id);
    const textarea = textareaRef.current;
    if (!heading || !textarea) return;
    const offset = wiki.markdown.split("\n").slice(0, heading.line).join("\n").length + (heading.line > 0 ? 1 : 0);
    textarea.setSelectionRange(offset, offset);
    textarea.scrollTop = Math.max(0, (heading.line / Math.max(1, wiki.markdown.split("\n").length)) * textarea.scrollHeight - 80);
  };

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
            <button type="button" onClick={() => void save()} disabled={!wiki.ready || wiki.saveState === "saving"}>
              <Save size={16} />Salvar
            </button>
            <button type="button" className="secondary-button" onClick={download}>
              <Download size={16} />Baixar .md
            </button>
          </>
        )}
      />

      <div className="wiki-context-bar">
        <div><strong>Documentação do projeto</strong><span>{wordCount} palavra{wordCount === 1 ? "" : "s"} · {headings.length} seções</span></div>
        <div className="wiki-view-switcher" role="group" aria-label="Visualização da wiki">
          <button type="button" className={view === "editor" ? "is-active" : ""} onClick={() => setView("editor")}>Editar</button>
          <button type="button" className={view === "split" ? "is-active" : ""} onClick={() => setView("split")}>Dividido</button>
          <button type="button" className={view === "preview" ? "is-active" : ""} onClick={() => setView("preview")}>Preview</button>
        </div>
      </div>

      <main className={`wiki-workspace is-${view}`}>
        <WikiAssistant
          tableCount={controller.diagram.tables.length}
          relationCount={controller.diagram.relations.length}
          headings={headings}
          hasContent={Boolean(wiki.markdown.trim())}
          onGenerate={generateStructure}
          onRefreshDictionary={refreshDictionary}
          onStartBlank={startBlank}
          onHeadingClick={goToHeading}
        />
        <div className="wiki-documents">
          <WikiEditor
            value={wiki.markdown}
            textareaRef={textareaRef}
            onChange={wiki.setMarkdown}
            onFormat={applyFormat}
          />
          <WikiPreview markdown={wiki.markdown} />
        </div>
        {!wiki.ready && <div className="wiki-loading"><LoaderCircle size={22} className="is-spinning" />Carregando a wiki deste projeto…</div>}
      </main>
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

function countWords(markdown: string): number {
  return markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
