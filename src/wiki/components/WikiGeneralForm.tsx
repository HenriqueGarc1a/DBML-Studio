import { BookOpenText, Database, ListTree, Sparkles, WrapText } from "lucide-react";
import type { ReactNode } from "react";
import type { DiagramModel } from "../../model/types";
import type { WikiDocument, WikiExportOptions } from "../wikiDocument";

type ProjectField = keyof WikiDocument["project"];

interface WikiGeneralFormProps {
  section: "overview" | "database" | "conclusion";
  project: WikiDocument["project"];
  options: WikiExportOptions;
  diagram: DiagramModel;
  onProjectFieldChange(field: ProjectField, value: string): void;
  onOptionChange(field: keyof WikiExportOptions, value: boolean): void;
}

export function WikiGeneralForm({ section, project, options, diagram, onProjectFieldChange, onOptionChange }: WikiGeneralFormProps) {
  if (section === "database") {
    return (
      <div className="wiki-builder-form">
        <FormHeading icon={Database} eyebrow="Banco de dados" title="Explique o desenho do banco" description="A estrutura técnica vem do diagrama. Você adiciona o contexto que o esquema sozinho não consegue contar." />
        <div className="wiki-builder-stats">
          <Stat value={diagram.tables.length} label="tabelas" />
          <Stat value={diagram.relations.length} label="relações" />
          <Stat value={diagram.enums.length} label="enumerações" />
        </div>
        <Field label="Visão geral do banco" hint="Descreva os domínios, como os dados se organizam e decisões importantes.">
          <textarea value={project.overview} onChange={(event) => onProjectFieldChange("overview", event.target.value)} rows={8} placeholder="Ex.: O banco está organizado em módulos de autenticação, catálogo e pedidos…" />
        </Field>
        <section className="wiki-builder-card wiki-builder-export-options">
          <div><strong>Conteúdo automático</strong><span>Escolha o que entra no Markdown final.</span></div>
          <Option checked={options.includeToc} icon={ListTree} label="Sumário automático" onChange={(value) => onOptionChange("includeToc", value)} />
          <Option checked={options.includeEnums} icon={Sparkles} label="Lista de enumerações" onChange={(value) => onOptionChange("includeEnums", value)} />
          <Option checked={options.includeRelationships} icon={Database} label="Relacionamentos por tabela" onChange={(value) => onOptionChange("includeRelationships", value)} />
        </section>
      </div>
    );
  }

  if (section === "conclusion") {
    return (
      <div className="wiki-builder-form">
        <FormHeading icon={WrapText} eyebrow="Encerramento" title="Conclusão" description="Registre as decisões principais, limitações conhecidas e próximos passos da documentação." />
        <Field label="Texto de conclusão" hint="Você pode usar parágrafos e Markdown básico.">
          <textarea value={project.conclusion} onChange={(event) => onProjectFieldChange("conclusion", event.target.value)} rows={14} placeholder="Resuma os pontos mais importantes do modelo de dados…" />
        </Field>
      </div>
    );
  }

  return (
    <div className="wiki-builder-form">
      <FormHeading icon={BookOpenText} eyebrow="Apresentação" title="Dê contexto à Wiki" description="Esses textos abrem o documento antes do dicionário técnico." />
      <Field label="Título da Wiki" hint="Aparece como o título principal do arquivo Markdown.">
        <input value={project.title} onChange={(event) => onProjectFieldChange("title", event.target.value)} placeholder="Nome da documentação" />
      </Field>
      <Field label="Resumo inicial" hint="Uma frase curta explicando o propósito deste documento.">
        <textarea value={project.summary} onChange={(event) => onProjectFieldChange("summary", event.target.value)} rows={3} placeholder="Documentação técnica e funcional do banco…" />
      </Field>
      <Field label="Introdução" hint="Contexto do produto, objetivo, público e escopo da documentação.">
        <textarea value={project.introduction} onChange={(event) => onProjectFieldChange("introduction", event.target.value)} rows={10} placeholder="Explique o projeto e o papel deste banco de dados…" />
      </Field>
    </div>
  );
}

function FormHeading({ icon: Icon, eyebrow, title, description }: { icon: typeof BookOpenText; eyebrow: string; title: string; description: string }) {
  return <header className="wiki-builder-form-heading"><span><Icon size={15} />{eyebrow}</span><h2>{title}</h2><p>{description}</p></header>;
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return <label className="wiki-builder-field"><span><strong>{label}</strong><small>{hint}</small></span>{children}</label>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function Option({ checked, icon: Icon, label, onChange }: { checked: boolean; icon: typeof Database; label: string; onChange(value: boolean): void }) {
  return <label><span><Icon size={15} />{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
