export type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface MarkdownHeading {
  level: MarkdownHeadingLevel;
  text: string;
  id: string;
  /** Zero-based source line, useful for keeping the outline and editor in sync. */
  line: number;
}

export type MarkdownInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: MarkdownInline[] }
  | { type: "emphasis"; children: MarkdownInline[] }
  | { type: "code"; value: string }
  | { type: "line-break" }
  | { type: "link"; href: string; title?: string; children: MarkdownInline[] };

export type MarkdownTableAlignment = "left" | "center" | "right" | undefined;

export type MarkdownBlock =
  | { type: "heading"; level: MarkdownHeadingLevel; id: string; children: MarkdownInline[] }
  | { type: "paragraph"; children: MarkdownInline[] }
  | { type: "list"; ordered: boolean; start?: number; items: MarkdownInline[][] }
  | { type: "blockquote"; children: MarkdownBlock[] }
  | { type: "code"; language?: string; value: string }
  | { type: "divider" }
  | {
    type: "table";
    headers: MarkdownInline[][];
    rows: MarkdownInline[][][];
    alignments: MarkdownTableAlignment[];
  }
  | { type: "toc"; headings: MarkdownHeading[] };

interface IndexedMarkdownHeading extends MarkdownHeading {
  lineIndex: number;
}

interface FenceStart {
  marker: "`" | "~";
  length: number;
  language?: string;
}

interface ListMatch {
  ordered: boolean;
  start?: number;
  content: string;
}

/** Extracts document headings using the same IDs used by parseMarkdownBlocks. */
export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  return collectMarkdownHeadings(normalizeLines(markdown)).map(({ lineIndex: _lineIndex, ...heading }) => heading);
}

/** Parses the supported Markdown subset into a render-agnostic, safe AST. */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  return parseLines(normalizeLines(markdown));
}

/** Parses inline Markdown. Unsupported HTML remains plain text. */
export function parseMarkdownInlines(source: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let buffer = "";
  let index = 0;

  const flushText = () => {
    if (!buffer) return;
    const previous = nodes[nodes.length - 1];
    if (previous?.type === "text") previous.value += buffer;
    else nodes.push({ type: "text", value: buffer });
    buffer = "";
  };

  while (index < source.length) {
    if (source[index] === "\\" && index + 1 < source.length && isEscapable(source[index + 1])) {
      buffer += source[index + 1];
      index += 2;
      continue;
    }

    const lineBreak = source.slice(index).match(/^<br\s*\/?>/i);
    if (lineBreak) {
      flushText();
      nodes.push({ type: "line-break" });
      index += lineBreak[0].length;
      continue;
    }

    if (source[index] === "`") {
      const markerLength = countRun(source, index, "`");
      const closingIndex = source.indexOf("`".repeat(markerLength), index + markerLength);
      if (closingIndex !== -1) {
        flushText();
        const rawValue = source.slice(index + markerLength, closingIndex);
        nodes.push({ type: "code", value: normalizeCodeSpan(rawValue) });
        index = closingIndex + markerLength;
        continue;
      }
    }

    if (source[index] === "[") {
      const labelEnd = findClosingBracket(source, index + 1);
      if (labelEnd !== -1 && source[labelEnd + 1] === "(") {
        const destinationEnd = findClosingParenthesis(source, labelEnd + 2);
        if (destinationEnd !== -1) {
          const destination = parseLinkDestination(source.slice(labelEnd + 2, destinationEnd));
          const safeHref = destination ? sanitizeMarkdownHref(destination.href) : undefined;
          if (destination && safeHref) {
            flushText();
            nodes.push({
              type: "link",
              href: safeHref,
              title: destination.title,
              children: parseMarkdownInlines(source.slice(index + 1, labelEnd)),
            });
            index = destinationEnd + 1;
            continue;
          }
        }
      }
    }

    const strongMarker = source.startsWith("**", index)
      ? "**"
      : source.startsWith("__", index)
        ? "__"
        : undefined;
    if (strongMarker && canOpenDelimiter(source, index, strongMarker.length)) {
      const closingIndex = findClosingDelimiter(source, strongMarker, index + strongMarker.length);
      if (closingIndex !== -1) {
        flushText();
        nodes.push({
          type: "strong",
          children: parseMarkdownInlines(source.slice(index + strongMarker.length, closingIndex)),
        });
        index = closingIndex + strongMarker.length;
        continue;
      }
    }

    const emphasisMarker = source[index] === "*" || source[index] === "_" ? source[index] : undefined;
    if (emphasisMarker && canOpenDelimiter(source, index, 1)) {
      const closingIndex = findClosingDelimiter(source, emphasisMarker, index + 1);
      if (closingIndex !== -1) {
        flushText();
        nodes.push({
          type: "emphasis",
          children: parseMarkdownInlines(source.slice(index + 1, closingIndex)),
        });
        index = closingIndex + 1;
        continue;
      }
    }

    buffer += source[index];
    index += 1;
  }

  flushText();
  return nodes;
}

/** Allows local links plus a small explicit set of safe URL schemes. */
export function sanitizeMarkdownHref(value: string): string | undefined {
  const href = value.trim().replace(/^<(.*)>$/, "$1");
  if (!href || /[\u0000-\u001f\u007f]/.test(href) || href.startsWith("//")) return undefined;

  const scheme = href.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && !["http", "https", "mailto", "tel"].includes(scheme)) return undefined;
  return href;
}

export function isExternalMarkdownHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function parseLines(lines: string[]): MarkdownBlock[] {
  const headings = collectMarkdownHeadings(lines);
  const headingsByLine = new Map(headings.map((heading) => [heading.lineIndex, heading]));
  const publicHeadings = headings.map(({ lineIndex: _lineIndex, ...heading }) => heading);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith("<!--")) {
      index = skipHtmlComment(lines, index);
      continue;
    }

    const fence = parseFenceStart(line);
    if (fence) {
      const content: string[] = [];
      index += 1;
      while (index < lines.length && !isFenceEnd(lines[index], fence)) {
        content.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language: fence.language, value: content.join("\n") });
      continue;
    }

    const heading = headingsByLine.get(index);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading.level,
        id: heading.id,
        children: parseMarkdownInlines(parseHeadingLine(line)?.text ?? heading.text),
      });
      index += 1;
      continue;
    }

    if (isTocLine(line)) {
      blocks.push({ type: "toc", headings: publicHeadings });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const parsedTable = parseTable(lines, index);
      blocks.push(parsedTable.block);
      index = parsedTable.nextIndex;
      continue;
    }

    if (isDivider(line)) {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }

    if (isBlockquoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isBlockquoteLine(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s{0,3}>[ \t]?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", children: parseLines(quoteLines) });
      continue;
    }

    const listMatch = parseListLine(line);
    if (listMatch) {
      const items: MarkdownInline[][] = [];
      const ordered = listMatch.ordered;
      const start = listMatch.start;
      let pendingContent = listMatch.content;
      index += 1;

      while (true) {
        while (index < lines.length && isListContinuation(lines[index])) {
          pendingContent += ` ${lines[index].trim()}`;
          index += 1;
        }
        items.push(parseMarkdownInlines(pendingContent));

        if (index >= lines.length) break;
        const nextItem = parseListLine(lines[index]);
        if (!nextItem || nextItem.ordered !== ordered) break;
        pendingContent = nextItem.content;
        index += 1;
      }

      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", children: parseMarkdownInlines(paragraphLines.join(" ")) });
  }

  return blocks;
}

function collectMarkdownHeadings(lines: string[]): IndexedMarkdownHeading[] {
  const headings: IndexedMarkdownHeading[] = [];
  const slugCounts = new Map<string, number>();
  let fence: FenceStart | undefined;
  let insideComment = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (insideComment) {
      if (line.includes("-->")) insideComment = false;
      continue;
    }
    if (line.trimStart().startsWith("<!--")) {
      insideComment = !line.includes("-->");
      continue;
    }
    if (fence) {
      if (isFenceEnd(line, fence)) fence = undefined;
      continue;
    }
    const nextFence = parseFenceStart(line);
    if (nextFence) {
      fence = nextFence;
      continue;
    }

    const parsed = parseHeadingLine(line);
    if (!parsed) continue;
    const text = inlineText(parseMarkdownInlines(parsed.text)).trim() || "Seção";
    const baseId = headingSlug(text);
    const count = (slugCounts.get(baseId) ?? 0) + 1;
    slugCounts.set(baseId, count);
    headings.push({
      lineIndex,
      line: lineIndex,
      level: parsed.level,
      text,
      id: count === 1 ? baseId : `${baseId}-${count}`,
    });
  }

  return headings;
}

function parseHeadingLine(line: string): { level: MarkdownHeadingLevel; text: string } | undefined {
  const match = line.match(/^\s{0,3}(#{1,6})(?:[ \t]+|$)(.*)$/);
  if (!match) return undefined;
  const text = match[2].replace(/[ \t]+#+[ \t]*$/, "").trim();
  return { level: match[1].length as MarkdownHeadingLevel, text };
}

function headingSlug(value: string): string {
  const slug = value
    .normalize("NFC")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return slug || "secao";
}

function inlineText(nodes: MarkdownInline[]): string {
  return nodes.map((node) => {
    if (node.type === "text" || node.type === "code") return node.value;
    if (node.type === "line-break") return " ";
    return inlineText(node.children);
  }).join("");
}

function parseFenceStart(line: string): FenceStart | undefined {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)?.*$/);
  if (!match) return undefined;
  const language = match[2]?.trim().match(/^[\w+-]+/)?.[0];
  return {
    marker: match[1][0] as FenceStart["marker"],
    length: match[1].length,
    language,
  };
}

function isFenceEnd(line: string, fence: FenceStart): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== fence.marker) return false;
  const markerLength = countRun(trimmed, 0, fence.marker);
  return markerLength >= fence.length && !trimmed.slice(markerLength).trim();
}

function isTocLine(line: string): boolean {
  return /^(?:_TOC_|\[\[_TOC_\]\])$/i.test(line.trim());
}

function isDivider(line: string): boolean {
  const trimmed = line.trim();
  return /^(?:\*\s*){3,}$/.test(trimmed)
    || /^(?:-\s*){3,}$/.test(trimmed)
    || /^(?:_\s*){3,}$/.test(trimmed);
}

function isBlockquoteLine(line: string): boolean {
  return /^\s{0,3}>/.test(line);
}

function parseListLine(line: string): ListMatch | undefined {
  const unordered = line.match(/^\s{0,3}[-+*][ \t]+(.+)$/);
  if (unordered) return { ordered: false, content: unordered[1] };
  const ordered = line.match(/^\s{0,3}(\d+)[.)][ \t]+(.+)$/);
  if (!ordered) return undefined;
  return { ordered: true, start: Number.parseInt(ordered[1], 10), content: ordered[2] };
}

function isListContinuation(line: string): boolean {
  return /^(?: {2,}|\t)\S/.test(line) && !parseListLine(line);
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index];
  return !line.trim()
    || line.trimStart().startsWith("<!--")
    || Boolean(parseFenceStart(line))
    || Boolean(parseHeadingLine(line))
    || isTocLine(line)
    || isTableStart(lines, index)
    || isDivider(line)
    || isBlockquoteLine(line)
    || Boolean(parseListLine(line));
}

function isTableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length || !hasTablePipe(lines[index])) return false;
  const headerCells = splitTableRow(lines[index]);
  const delimiterCells = splitTableRow(lines[index + 1]);
  return headerCells.length > 0
    && headerCells.length === delimiterCells.length
    && delimiterCells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTable(lines: string[], index: number): { block: MarkdownBlock; nextIndex: number } {
  const rawHeaders = splitTableRow(lines[index]);
  const rawDelimiters = splitTableRow(lines[index + 1]);
  const columnCount = rawHeaders.length;
  const rows: MarkdownInline[][][] = [];
  index += 2;

  while (index < lines.length && lines[index].trim() && hasTablePipe(lines[index])) {
    const cells = splitTableRow(lines[index]);
    const normalized = Array.from({ length: columnCount }, (_, cellIndex) =>
      parseMarkdownInlines(cells[cellIndex]?.trim() ?? ""));
    rows.push(normalized);
    index += 1;
  }

  return {
    block: {
      type: "table",
      headers: rawHeaders.map((cell) => parseMarkdownInlines(cell.trim())),
      rows,
      alignments: rawDelimiters.map(parseTableAlignment),
    },
    nextIndex: index,
  };
}

function parseTableAlignment(delimiter: string): MarkdownTableAlignment {
  const value = delimiter.trim();
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  if (value.startsWith(":")) return "left";
  return undefined;
}

function hasTablePipe(line: string): boolean {
  let escaped = false;
  let codeMarkerLength = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "`") {
      const run = countRun(line, index, "`");
      if (codeMarkerLength === 0) codeMarkerLength = run;
      else if (run === codeMarkerLength) codeMarkerLength = 0;
      index += run - 1;
      continue;
    }
    if (character === "|" && codeMarkerLength === 0) return true;
  }
  return false;
}

function splitTableRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (endsWithUnescapedPipe(value)) value = value.slice(0, -1);

  const cells: string[] = [];
  let cell = "";
  let codeMarkerLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && value[index + 1] === "|") {
      cell += "|";
      index += 1;
      continue;
    }
    if (character === "`") {
      const run = countRun(value, index, "`");
      if (codeMarkerLength === 0) codeMarkerLength = run;
      else if (run === codeMarkerLength) codeMarkerLength = 0;
      cell += "`".repeat(run);
      index += run - 1;
      continue;
    }
    if (character === "|" && codeMarkerLength === 0) {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += character;
  }
  cells.push(cell);
  return cells;
}

function endsWithUnescapedPipe(value: string): boolean {
  if (!value.endsWith("|")) return false;
  let slashCount = 0;
  for (let index = value.length - 2; index >= 0 && value[index] === "\\"; index -= 1) slashCount += 1;
  return slashCount % 2 === 0;
}

function skipHtmlComment(lines: string[], startIndex: number): number {
  if (lines[startIndex].includes("-->")) return startIndex + 1;
  let index = startIndex + 1;
  while (index < lines.length && !lines[index].includes("-->")) index += 1;
  return Math.min(lines.length, index + 1);
}

function parseLinkDestination(raw: string): { href: string; title?: string } | undefined {
  const value = raw.trim();
  if (!value) return undefined;

  if (value.startsWith("<")) {
    const closing = value.indexOf(">");
    if (closing === -1) return undefined;
    const href = value.slice(1, closing);
    const title = parseLinkTitle(value.slice(closing + 1).trim());
    return title ? { href, title } : { href };
  }

  const titleMatch = value.match(/^(.*?)[ \t]+(?:"([^"]*)"|'([^']*)')$/);
  if (!titleMatch) return { href: value };
  return { href: titleMatch[1].trim(), title: titleMatch[2] ?? titleMatch[3] };
}

function parseLinkTitle(value: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^(?:"([^"]*)"|'([^']*)')$/);
  return match ? (match[1] ?? match[2]) : undefined;
}

function findClosingBracket(source: string, startIndex: number): number {
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === "[") depth += 1;
    if (source[index] === "]") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function findClosingParenthesis(source: string, startIndex: number): number {
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function findClosingDelimiter(source: string, marker: string, startIndex: number): number {
  let index = startIndex;
  while (index < source.length) {
    const closingIndex = source.indexOf(marker, index);
    if (closingIndex === -1) return -1;
    if (source[closingIndex - 1] !== "\\" && canCloseDelimiter(source, closingIndex, marker.length)) {
      return closingIndex;
    }
    index = closingIndex + marker.length;
  }
  return -1;
}

function canOpenDelimiter(source: string, index: number, length: number): boolean {
  const previous = source[index - 1];
  const next = source[index + length];
  return Boolean(next && !/\s/.test(next) && (!previous || !isWordCharacter(previous) || !isWordCharacter(next)));
}

function canCloseDelimiter(source: string, index: number, length: number): boolean {
  const previous = source[index - 1];
  const next = source[index + length];
  return Boolean(previous && !/\s/.test(previous) && (!next || !isWordCharacter(previous) || !isWordCharacter(next)));
}

function isWordCharacter(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

function isEscapable(value: string): boolean {
  return /[\\`*{}\[\]()#+.!_>|~-]/.test(value);
}

function normalizeCodeSpan(value: string): string {
  const normalized = value.replace(/\s+/g, " ");
  return normalized.startsWith(" ") && normalized.endsWith(" ") && normalized.trim()
    ? normalized.slice(1, -1)
    : normalized;
}

function countRun(source: string, startIndex: number, character: string): number {
  let length = 0;
  while (source[startIndex + length] === character) length += 1;
  return length;
}

function normalizeLines(markdown: string): string[] {
  return markdown.replace(/\r\n?/g, "\n").split("\n");
}
