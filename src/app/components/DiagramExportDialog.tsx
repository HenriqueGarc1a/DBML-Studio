import { Download, FileCode2, FileImage, FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { downloadText } from "../../utils/download";

type ExportFormat = "pdf" | "svg" | "png" | "tikz" | "dbml";

export function DiagramExportDialog({ svg, filename, dbml, tikz, onClose, onExported }: {
  svg: SVGSVGElement | null;
  filename: string;
  dbml: string;
  tikz: string;
  onClose(): void;
  onExported(message: string): void;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [scale, setScale] = useState(2);
  const [includeGrid, setIncludeGrid] = useState(true);
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [pdfPages, setPdfPages] = useState<"normal" | "all-flow" | "both">("normal");
  const [working, setWorking] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stem = filename.replace(/\.dbml$/i, "") || "diagram";

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const exportFile = async () => {
    setWorking(true);
    try {
      if (format === "dbml") downloadText(`${stem}.dbml`, dbml);
      else if (format === "tikz") downloadText(`${stem}.tex`, tikz);
      else {
        const exporter = await import("../../utils/pdfExport");
        const options = { includeGrid, transparentBackground, scale };
        if (format === "svg") await exporter.exportDiagramSvg(svg, `${stem}.svg`, options);
        else if (format === "png") await exporter.exportDiagramPng(svg, `${stem}.png`, options);
        else await exporter.exportDiagramPdf(svg, { ...options, filename: `${stem}.pdf`, pages: pdfPages });
      }
      onExported(`${format.toUpperCase()} exportado`);
      onClose();
    } finally {
      setWorking(false);
    }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="modal-panel export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-heading"><div><h2 id="export-title">Exportar diagrama</h2><small>Escolha o formato e a aparência do arquivo.</small></div><button ref={closeRef} type="button" className="icon-button" aria-label="Fechar exportação" onClick={onClose}><X size={16} /></button></div>
      <div className="export-dialog-body">
        <div className="export-format-grid">
          {(["pdf", "svg", "png", "tikz", "dbml"] as ExportFormat[]).map((value) => <button type="button" key={value} className={format === value ? "is-active" : ""} aria-pressed={format === value} onClick={() => setFormat(value)}>{value === "png" || value === "svg" ? <FileImage size={16} /> : value === "tikz" ? <FileCode2 size={16} /> : <FileText size={16} />}<strong>{value.toUpperCase()}</strong></button>)}
        </div>
        {(format === "pdf" || format === "png" || format === "svg") && <div className="export-options">
          {format !== "svg" && <label><span>Escala</span><select value={scale} onChange={(event) => setScale(Number(event.target.value))}><option value={1}>1×</option><option value={1.5}>1,5×</option><option value={2}>2×</option><option value={3}>3×</option><option value={4}>4×</option></select></label>}
          <label><span>Incluir grid</span><input type="checkbox" checked={includeGrid} onChange={(event) => setIncludeGrid(event.target.checked)} /></label>
          <label><span>Fundo transparente</span><input type="checkbox" checked={transparentBackground} onChange={(event) => setTransparentBackground(event.target.checked)} /></label>
          {format === "pdf" && <label><span>Páginas</span><select value={pdfPages} onChange={(event) => setPdfPages(event.target.value as typeof pdfPages)}><option value="normal">Normal</option><option value="all-flow">Fluxos destacados</option><option value="both">Normal + fluxos</option></select></label>}
        </div>}
        {format === "tikz" && <textarea className="export-code-preview" readOnly value={tikz} aria-label="Prévia TikZ" />}
      </div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="button" disabled={working || (!svg && format !== "dbml" && format !== "tikz")} onClick={() => void exportFile()}><Download size={15} />{working ? "Exportando…" : "Exportar"}</button></div>
    </section>
  </div>;
}
