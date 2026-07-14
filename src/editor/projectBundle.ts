import type { SavedDiagram } from "./diagramLibrary";

export const PROJECT_BUNDLE_VERSION = 1;

export interface ProjectBundle {
  type: "dbml-studio-project";
  version: typeof PROJECT_BUNDLE_VERSION;
  exportedAt: string;
  project: Pick<SavedDiagram, "name" | "filename" | "dbml" | "uiLayout" | "previewDataUrl" | "wiki" | "wikiDocument" | "updatedAt">;
}

export function serializeProjectBundle(project: SavedDiagram): string {
  const bundle: ProjectBundle = {
    type: "dbml-studio-project",
    version: PROJECT_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      filename: project.filename,
      dbml: project.dbml,
      uiLayout: project.uiLayout,
      previewDataUrl: project.previewDataUrl,
      wiki: project.wiki,
      wikiDocument: project.wikiDocument,
      updatedAt: project.updatedAt,
    },
  };
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function parseProjectBundle(source: string): ProjectBundle {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("O pacote não contém JSON válido.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Pacote de projeto inválido.");
  const bundle = value as Partial<ProjectBundle>;
  if (bundle.type !== "dbml-studio-project" || bundle.version !== PROJECT_BUNDLE_VERSION) {
    throw new Error("Formato ou versão do pacote não suportado.");
  }
  if (!bundle.project || typeof bundle.project.name !== "string" || typeof bundle.project.dbml !== "string") {
    throw new Error("O pacote não possui um projeto DBML válido.");
  }
  return bundle as ProjectBundle;
}
