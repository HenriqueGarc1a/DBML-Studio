import { X } from "lucide-react";
import { useEffect, useRef } from "react";

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel help-panel" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><h2 id="help-title">Ajuda do DBML Studio</h2><button ref={closeRef} type="button" className="icon-button" aria-label="Fechar ajuda" onClick={onClose}><X size={16} /></button></div>
        <div className="help-content">
          <section className="help-section"><h3>Criar e importar</h3><p>Comece pela biblioteca: novo schema, SQL, arquivo DBML, pacote completo ou catálogo de PostgreSQL/MySQL/SQLite.</p></section>
          <section className="help-section"><h3>Editar</h3><ol><li>Use Nova tabela na barra flutuante.</li><li>Selecione tabela ou campo para editar notes, defaults, índices, enums e settings no painel direito.</li><li>Para relações, clique primeiro no campo pai e depois no campo FK da filha.</li></ol></section>
          <section className="help-section"><h3>Navegar</h3><p>Use a busca no canto do canvas, o minimapa e o fit da seleção. Segure Shift para selecionar e mover várias tabelas; o foco de vizinhos isola dependências.</p></section>
          <section className="help-section"><h3>Linhas</h3><p>Círculos movem trechos retos e losangos reposicionam curvas. Rotas não atravessam tabelas nem cruzam a si mesmas.</p></section>
          <section className="help-section"><h3>Salvar e recuperar</h3><p>O indicador mostra alterações pendentes, persistência local ou falha. Salvar cria um snapshot; Versões restaura estados anteriores.</p></section>
          <section className="help-section"><h3>Comparar e exportar</h3><p>Comparar banco lista o drift e gera SQL para revisão sem executá-lo. Exportar oferece DBML, TikZ, SVG, PNG e PDF.</p></section>
        </div>
      </section>
    </div>
  );
}
