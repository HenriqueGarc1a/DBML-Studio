import type { jsPDF as JsPdfInstance } from "jspdf";

interface SvgDimensions {
  width: number;
  height: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_CANVAS_SIDE = 4096;

const INLINE_STYLE_PROPERTIES = [
  "fill",
  "fill-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "opacity",
  "paint-order",
  "stroke",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
];

export async function exportDiagramPdf(
  svg: SVGSVGElement | null,
  filename = "diagram.pdf",
): Promise<boolean> {
  if (!svg) return false;

  const dimensions = getSvgDimensions(svg);
  if (dimensions.width <= 0 || dimensions.height <= 0) return false;

  const png = await svgToPng(svg, dimensions);
  const { jsPDF } = await import("jspdf");
  const margin = 24;
  const pageWidth = Math.max(320, dimensions.width);
  const pageHeight = Math.max(240, dimensions.height);
  const pdf = new jsPDF({
    orientation: pageWidth >= pageHeight ? "landscape" : "portrait",
    unit: "pt",
    format: [pageWidth, pageHeight],
  }) as JsPdfInstance;

  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const scale = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height);
  const drawWidth = dimensions.width * scale;
  const drawHeight = dimensions.height * scale;
  const x = (pageWidth - drawWidth) / 2;
  const y = (pageHeight - drawHeight) / 2;

  pdf.addImage(png, "PNG", x, y, drawWidth, drawHeight);
  pdf.save(filename);
  return true;
}

async function svgToPng(svg: SVGSVGElement, dimensions: SvgDimensions): Promise<string> {
  const clone = cloneSvgForExport(svg, dimensions);
  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = await loadImage(url);
    const requestedScale = window.devicePixelRatio > 1 ? 2 : 1.5;
    const scale = Math.max(1, Math.min(requestedScale, MAX_CANVAS_SIDE / Math.max(dimensions.width, dimensions.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(dimensions.width * scale);
    canvas.height = Math.ceil(dimensions.height * scale);

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Nao foi possivel criar contexto 2D para exportar PDF.");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cloneSvgForExport(svg: SVGSVGElement, dimensions: SvgDimensions): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originalElements = [svg, ...Array.from(svg.querySelectorAll("*"))];
  const clonedElements = [clone, ...Array.from(clone.querySelectorAll("*"))];

  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", dimensions.width.toString());
  clone.setAttribute("height", dimensions.height.toString());
  clone.setAttribute("viewBox", getExportViewBox(svg));

  for (let index = 0; index < originalElements.length; index += 1) {
    const source = originalElements[index];
    const target = clonedElements[index] as SVGElement | undefined;
    if (!target) continue;

    const computed = window.getComputedStyle(source);
    const inlineStyles = INLINE_STYLE_PROPERTIES
      .map((property) => {
        const value = computed.getPropertyValue(property);
        return value ? `${property}:${value}` : "";
      })
      .filter(Boolean)
      .join(";");
    const existingStyle = target.getAttribute("style");

    target.setAttribute("style", [existingStyle, inlineStyles].filter(Boolean).join(";"));
  }

  return clone;
}

function getSvgDimensions(svg: SVGSVGElement): SvgDimensions {
  const viewBox = parseViewBox(getExportViewBox(svg)) ?? svg.viewBox.baseVal;
  const rect = svg.getBoundingClientRect();

  return {
    width: Math.max(viewBox.width || rect.width || 1200, 1),
    height: Math.max(viewBox.height || rect.height || 800, 1),
  };
}

function getExportViewBox(svg: SVGSVGElement): string {
  return svg.dataset.exportViewbox || svg.getAttribute("viewBox") || "0 0 1200 800";
}

function parseViewBox(value: string): SvgDimensions | undefined {
  const parts = value.split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined;

  return {
    width: Math.max(parts[2], 1),
    height: Math.max(parts[3], 1),
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel carregar o SVG para exportar PDF."));
    image.src = url;
  });
}
