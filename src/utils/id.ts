export function slugify(value: string): string {
  const slug = value
    .trim()
    .replace(/["'`]/g, "")
    .replace(/[^a-zA-Z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return slug || "item";
}

export function makeId(prefix: string, value: string, index?: number): string {
  const suffix = index === undefined ? "" : `-${index}`;
  return `${prefix}-${slugify(value)}${suffix}`;
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
