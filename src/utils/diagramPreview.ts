import type { TableModel } from "../model/types";

export async function captureDiagramPreview(svg: SVGSVGElement | null, tables: TableModel[]): Promise<string | undefined> {
  if (!svg) return undefined;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(".relation-edit-handles, .resize-handle, .relation-flow-arrow").forEach((node) => node.remove());
  clone.setAttribute("width", "640");
  clone.setAttribute("height", "360");
  const bounds = previewBounds(tables);
  clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function previewBounds(tables: TableModel[]): { x: number; y: number; width: number; height: number } {
  if (!tables.length) return { x: 0, y: 0, width: 640, height: 360 };
  const padding = 80;
  const left = Math.min(...tables.map((table) => table.x)) - padding;
  const top = Math.min(...tables.map((table) => table.y)) - padding;
  const right = Math.max(...tables.map((table) => table.x + table.width)) + padding;
  const bottom = Math.max(...tables.map((table) => table.y + table.height)) + padding;
  const width = right - left;
  const height = bottom - top;
  const targetRatio = 16 / 9;
  if (width / height > targetRatio) {
    const nextHeight = width / targetRatio;
    return { x: left, y: top - (nextHeight - height) / 2, width, height: nextHeight };
  }
  const nextWidth = height * targetRatio;
  return { x: left - (nextWidth - width) / 2, y: top, width: nextWidth, height };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível gerar a prévia do esquema."));
    image.src = source;
  });
}
