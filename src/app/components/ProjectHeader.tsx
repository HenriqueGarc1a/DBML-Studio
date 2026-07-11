import { ArrowLeft, BookOpenText, Boxes, Database, Workflow } from "lucide-react";
import type { ReactNode } from "react";

export type ProjectSection = "diagram" | "wiki";

interface ProjectHeaderProps {
  projectName: string;
  projectFilename?: string;
  activeSection: ProjectSection;
  onMenu(): void;
  onSectionChange(section: ProjectSection): void;
  actions?: ReactNode;
}

export function ProjectHeader({
  projectName,
  projectFilename,
  activeSection,
  onMenu,
  onSectionChange,
  actions,
}: ProjectHeaderProps) {
  return (
    <header className="topbar project-topbar">
      <button type="button" className="secondary-button menu-back-button" onClick={onMenu}>
        <ArrowLeft size={16} />
        Menu
      </button>
      <div className="brand project-brand"><Boxes size={22} /><h1>DBML Studio</h1></div>
      <div className="active-diagram-name" title={projectFilename ?? projectName}>
        <Database size={15} />
        <span>{projectName}</span>
      </div>
      <nav className="project-tabs" aria-label="Áreas do projeto">
        <button
          type="button"
          className={`project-tab${activeSection === "diagram" ? " is-active" : ""}`}
          aria-current={activeSection === "diagram" ? "page" : undefined}
          onClick={() => onSectionChange("diagram")}
        >
          <Workflow size={15} />
          Diagrama
        </button>
        <button
          type="button"
          className={`project-tab${activeSection === "wiki" ? " is-active" : ""}`}
          aria-current={activeSection === "wiki" ? "page" : undefined}
          onClick={() => onSectionChange("wiki")}
        >
          <BookOpenText size={15} />
          Wiki
        </button>
      </nav>
      <div className="toolbar">{actions}</div>
    </header>
  );
}
