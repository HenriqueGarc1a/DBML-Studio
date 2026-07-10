import { X } from "lucide-react";

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel help-panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><h2>Ajuda do DBML Studio</h2><button type="button" className="icon-button" onClick={onClose}><X size={16} /></button></div>
        <div className="help-content">
          <section className="help-section"><h3>Criar e editar</h3><ol><li>Crie ou importe esquemas pelo menu.</li><li>Use Nova tabela na barra flutuante.</li><li>Para relações, clique primeiro no campo pai e depois no campo FK da filha.</li></ol></section>
          <section className="help-section"><h3>Linhas</h3><p>Círculos movem trechos retos e losangos reposicionam curvas. Rotas não atravessam tabelas nem cruzam a si mesmas.</p></section>
          <section className="help-section"><h3>Salvar</h3><p>Salvar atualiza DBML, layout e preview. Use Menu para voltar à biblioteca.</p></section>
        </div>
      </section>
    </div>
  );
}
