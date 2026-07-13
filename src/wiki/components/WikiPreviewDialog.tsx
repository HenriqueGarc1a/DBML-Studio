import { Check, Clipboard, Download, Eye, FileCode2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WikiPreview } from "./WikiPreview";

interface WikiPreviewDialogProps {
  open: boolean;
  title: string;
  markdown: string;
  onClose(): void;
  onCopy(): Promise<boolean> | boolean;
  onDownload(): void;
}

export function WikiPreviewDialog({ open, title, markdown, onClose, onCopy, onDownload }: WikiPreviewDialogProps) {
  const [tab, setTab] = useState<"document" | "markdown">("document");
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    setTab("document");
    requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);
  if (!open) return null;

  const copy = async () => {
    const copiedSuccessfully = await onCopy();
    if (!copiedSuccessfully) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="modal-backdrop wiki-preview-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="wiki-preview-dialog" role="dialog" aria-modal="true" aria-label={`Visualização de ${title}`} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>Markdown gerado</span><h2>{title}</h2></div>
          <div className="wiki-preview-dialog-actions">
            <button type="button" className="secondary-button" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? "Copiado" : "Copiar"}</button>
            <button type="button" onClick={onDownload}><Download size={15} />Baixar .md</button>
            <button ref={closeRef} type="button" className="icon-button" aria-label="Fechar visualização" onClick={onClose}><X size={17} /></button>
          </div>
        </header>
        <div className="wiki-preview-dialog-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "document"} className={tab === "document" ? "is-active" : ""} onClick={() => setTab("document")}><Eye size={15} />Documento</button>
          <button type="button" role="tab" aria-selected={tab === "markdown"} className={tab === "markdown" ? "is-active" : ""} onClick={() => setTab("markdown")}><FileCode2 size={15} />Markdown</button>
        </div>
        <div className={`wiki-preview-dialog-body is-${tab}`}>
          {tab === "document" ? <WikiPreview markdown={markdown} /> : <textarea className="wiki-generated-markdown" readOnly value={markdown} aria-label="Markdown gerado" spellCheck={false} />}
        </div>
      </section>
    </div>
  );
}
