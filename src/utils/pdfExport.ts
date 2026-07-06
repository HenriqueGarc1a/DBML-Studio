import type { jsPDF as JsPdfInstance } from "jspdf";

interface SvgDimensions {
  width: number;
  height: number;
}

interface PdfImageLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SvgExportOptions {
  variant?: "normal" | "all-flow";
}

interface FlowArrowPlacement {
  x: number;
  y: number;
  angle: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_CANVAS_SIDE = 4096;
const FLOW_ARROW_PATH = "M -8 -4.5 L 2 0 L -8 4.5";

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

  const allFlowPng = await svgToPng(svg, dimensions, { variant: "all-flow" });
  const normalPng = await svgToPng(svg, dimensions);
  const { jsPDF } = await import("jspdf");
  const margin = 0;
  const pageWidth = Math.max(320, dimensions.width);
  const pageHeight = Math.max(240, dimensions.height);
  const orientation = pageWidth >= pageHeight ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "pt",
    format: [pageWidth, pageHeight],
  }) as JsPdfInstance;

  const layout = getPdfImageLayout(dimensions, pageWidth, pageHeight, margin);

  addImagePage(pdf, normalPng, layout);
  pdf.save(filename);
  return true;
}

async function svgToPng(
  svg: SVGSVGElement,
  dimensions: SvgDimensions,
  options: SvgExportOptions = {},
): Promise<string> {
  const clone = cloneSvgForExport(svg, dimensions, options);
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

function cloneSvgForExport(
  svg: SVGSVGElement,
  dimensions: SvgDimensions,
  options: SvgExportOptions,
): SVGSVGElement {
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

  if (options.variant === "all-flow") {
    prepareAllFlowExport(svg, clone);
  }

  return clone;
}

function addImagePage(pdf: JsPdfInstance, png: string, layout: PdfImageLayout): void {
  pdf.addImage(png, "PNG", layout.x, layout.y, layout.width, layout.height);
}

function getPdfImageLayout(
  dimensions: SvgDimensions,
  pageWidth: number,
  pageHeight: number,
  margin: number,
): PdfImageLayout {
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const scale = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height);
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;

  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}

function prepareAllFlowExport(sourceSvg: SVGSVGElement, clone: SVGSVGElement): void {
  const sourceGroups = Array.from(sourceSvg.querySelectorAll<SVGGElement>(".relation-path"));
  const clonedGroups = Array.from(clone.querySelectorAll<SVGGElement>(".relation-path"));
  const outlineColor = getSvgCssValue(sourceSvg, "--canvas-bg", "#0f172a");

  clone.querySelectorAll(".relation-flow-arrow, .relation-highlight-glow").forEach((element) => element.remove());

  sourceGroups.forEach((sourceGroup, index) => {
    const clonedGroup = clonedGroups[index];
    if (!clonedGroup) return;

    const sourceStroke = sourceGroup.querySelector<SVGPathElement>(".relation-stroke");
    const clonedStroke = clonedGroup.querySelector<SVGPathElement>(".relation-stroke");
    if (!sourceStroke || !clonedStroke) return;

    const path = sourceStroke.getAttribute("d");
    if (!path) return;

    const length = getPathLength(sourceStroke);
    if (length < 12) return;

    const computedStroke = window.getComputedStyle(sourceStroke);
    const baseColor = computedStroke.getPropertyValue("stroke") || clonedStroke.getAttribute("stroke") || "#2dd4bf";
    const lineColor = brightenCssColor(baseColor, 0.32);
    const strokeWidth = numberOr(computedStroke.getPropertyValue("stroke-width"), 2);
    const flowColor = sourceGroup.dataset.exportFlowColor || lineColor;
    const flowDirection = sourceGroup.dataset.exportFlowDirection === "forward" ? "forward" : "reverse";

    const glow = createRelationGlow(path, lineColor, strokeWidth);
    clonedGroup.insertBefore(glow, clonedStroke);

    clonedStroke.style.setProperty("stroke", lineColor);
    clonedStroke.style.setProperty("stroke-opacity", "1");
    clonedStroke.style.setProperty("stroke-width", `${strokeWidth + 1}px`);
    clonedStroke.setAttribute("stroke", lineColor);
    clonedStroke.setAttribute("stroke-opacity", "1");
    clonedStroke.setAttribute("stroke-width", String(strokeWidth + 1));

    const arrows = createStaticFlowArrows(sourceStroke, flowDirection, flowColor, outlineColor);
    const insertBefore = clonedStroke.nextSibling;
    arrows.forEach((arrow) => clonedGroup.insertBefore(arrow, insertBefore));
  });
}

function createRelationGlow(path: string, color: string, strokeWidth: number): SVGPathElement {
  const glow = document.createElementNS(SVG_NS, "path");
  glow.setAttribute("d", path);
  glow.setAttribute("fill", "none");
  glow.setAttribute("stroke", color);
  glow.setAttribute("stroke-width", String(strokeWidth + 7));
  glow.setAttribute("stroke-opacity", "0.2");
  glow.setAttribute("stroke-linecap", "round");
  glow.setAttribute("stroke-linejoin", "round");
  glow.setAttribute("pointer-events", "none");
  glow.setAttribute("class", "relation-highlight-glow");
  glow.style.setProperty("filter", `drop-shadow(0 0 6px ${color})`);

  return glow;
}

function createStaticFlowArrows(
  path: SVGPathElement,
  direction: "forward" | "reverse",
  color: string,
  outlineColor: string,
): SVGGElement[] {
  return getStaticFlowArrowPlacements(path, direction).map((placement) => {
    const arrow = document.createElementNS(SVG_NS, "g");
    arrow.setAttribute("class", "relation-flow-arrow is-export-static");
    arrow.setAttribute(
      "transform",
      `translate(${formatNumber(placement.x)} ${formatNumber(placement.y)}) rotate(${formatNumber(placement.angle)})`,
    );
    arrow.setAttribute("opacity", "0.95");
    arrow.setAttribute("pointer-events", "none");
    arrow.style.setProperty("filter", `drop-shadow(0 0 3px ${color})`);

    const outline = createArrowPath(outlineColor, 6, 0.68);
    const stroke = createArrowPath(color, 3.2, 1);
    arrow.append(outline, stroke);

    return arrow;
  });
}

function createArrowPath(color: string, width: number, opacity: number): SVGPathElement {
  const arrowPath = document.createElementNS(SVG_NS, "path");
  arrowPath.setAttribute("d", FLOW_ARROW_PATH);
  arrowPath.setAttribute("fill", "none");
  arrowPath.setAttribute("stroke", color);
  arrowPath.setAttribute("stroke-width", String(width));
  arrowPath.setAttribute("stroke-linecap", "round");
  arrowPath.setAttribute("stroke-linejoin", "round");
  arrowPath.setAttribute("opacity", String(opacity));

  return arrowPath;
}

function getStaticFlowArrowPlacements(
  path: SVGPathElement,
  direction: "forward" | "reverse",
): FlowArrowPlacement[] {
  const length = getPathLength(path);
  const count = getExportFlowArrowCount(length);
  if (count === 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const flowDistance = ((index + 1) / (count + 1)) * length;
    const pathDistance = direction === "reverse" ? length - flowDistance : flowDistance;
    const point = path.getPointAtLength(pathDistance);
    const tangentDistance = direction === "reverse"
      ? Math.max(0, pathDistance - 2)
      : Math.min(length, pathDistance + 2);
    const tangentPoint = path.getPointAtLength(tangentDistance === pathDistance ? pathDistance : tangentDistance);
    const fallbackPoint = direction === "reverse"
      ? path.getPointAtLength(Math.min(length, pathDistance + 2))
      : path.getPointAtLength(Math.max(0, pathDistance - 2));
    const dx = tangentPoint.x - point.x || point.x - fallbackPoint.x;
    const dy = tangentPoint.y - point.y || point.y - fallbackPoint.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    return {
      x: point.x,
      y: point.y,
      angle: Number.isFinite(angle) ? angle : 0,
    };
  });
}

export function getExportFlowArrowCount(length: number): number {
  if (length < 24) return 0;
  if (length > 640) return 6;
  if (length > 460) return 5;
  if (length > 280) return 4;
  if (length > 130) return 3;
  return 2;
}

function getPathLength(path: SVGPathElement): number {
  try {
    return path.getTotalLength();
  } catch {
    return 0;
  }
}

function getSvgCssValue(svg: SVGSVGElement, property: string, fallback: string): string {
  return window.getComputedStyle(svg).getPropertyValue(property).trim() || fallback;
}

function numberOr(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function brightenCssColor(color: string, amount: number): string {
  const rgb = parseCssRgb(color);
  if (!rgb) return color;

  const next = [rgb.r, rgb.g, rgb.b]
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .join(", ");

  return `rgb(${next})`;
}

function parseCssRgb(color: string): { r: number; g: number; b: number } | undefined {
  const rgbMatch = color.match(
    /rgba?\(\s*(\d+(?:\.\d+)?)(?:\s*,\s*|\s+)(\d+(?:\.\d+)?)(?:\s*,\s*|\s+)(\d+(?:\.\d+)?)/i,
  );
  if (rgbMatch) {
    return {
      r: clampColor(Number.parseFloat(rgbMatch[1])),
      g: clampColor(Number.parseFloat(rgbMatch[2])),
      b: clampColor(Number.parseFloat(rgbMatch[3])),
    };
  }

  const hexMatch = color.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!hexMatch) return undefined;

  return {
    r: Number.parseInt(hexMatch[1].slice(0, 2), 16),
    g: Number.parseInt(hexMatch[1].slice(2, 4), 16),
    b: Number.parseInt(hexMatch[1].slice(4, 6), 16),
  };
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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
