import { Copy, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadText } from "../utils/download";

interface ExportPanelProps {
  dbml: string;
  tikz: string;
  onExportPdf: () => Promise<boolean>;
}

export function ExportPanel({ dbml, tikz, onExportPdf }: ExportPanelProps) {
  const [active, setActive] = useState<"dbml" | "tikz">("dbml");
  const [message, setMessage] = useState("");
  const value = active === "dbml" ? dbml : tikz;
  const filename = useMemo(() => (active === "dbml" ? "diagram.dbml" : "diagram.tex"), [active]);

  const copy = async () => {
    if (!value.trim()) {
      setMessage("Nada para copiar");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copiado");
    } catch {
      setMessage("Clipboard bloqueado");
    }
  };

  const download = () => {
    setMessage(downloadText(filename, value) ? "Arquivo gerado" : "Nada para exportar");
  };

  const downloadPdf = async () => {
    setMessage((await onExportPdf()) ? "PDF gerado" : "PDF indisponivel");
  };

  return (
    <section className="export-pane">
      <div className="export-tabs">
        <button type="button" className={active === "dbml" ? "is-active" : ""} onClick={() => setActive("dbml")}>
          DBML
        </button>
        <button type="button" className={active === "tikz" ? "is-active" : ""} onClick={() => setActive("tikz")}>
          TikZ
        </button>
        <button type="button" onClick={() => void downloadPdf()}>
          PDF
        </button>
        <span className="export-spacer" />
        {message && <span className="export-message">{message}</span>}
        <button type="button" className="icon-button" title="Copiar" onClick={() => void copy()}>
          <Copy size={16} />
        </button>
        <button type="button" className="icon-button" title="Baixar" onClick={download}>
          <Download size={16} />
        </button>
      </div>
      <textarea readOnly value={value} spellCheck={false} />
    </section>
  );
}
