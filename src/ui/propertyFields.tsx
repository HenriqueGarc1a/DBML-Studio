import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import type { SavedColor } from "../model/types";
import { safeGetItem, safeSetItem } from "../utils/storage";

const PROPERTY_GROUP_STORAGE_PREFIX = "dbml-studio-property-group:";

export function CollapsibleGroup({ id, title, defaultOpen = true, actions, children }: { id: string; title: string; defaultOpen?: boolean; actions?: ReactNode; children: ReactNode }) {
  const [stored, setStored] = useState(() => ({ id, open: readOpen(id, defaultOpen) }));
  const open = stored.id === id ? stored.open : readOpen(id, defaultOpen);
  useEffect(() => { safeSetItem(`${PROPERTY_GROUP_STORAGE_PREFIX}${id}`, open ? "open" : "closed"); }, [id, open]);
  return <div className={`property-group${open ? " is-open" : ""}`}><div className="property-group-heading">
    <button type="button" className="property-group-toggle" aria-expanded={open} onClick={() => setStored({ id, open: !open })}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span>{title}</span></button>
    {actions && open && <div className="property-group-actions">{actions}</div>}
  </div>{open && <div className="property-group-body">{children}</div>}</div>;
}
function readOpen(id: string, fallback: boolean): boolean {
  const stored = safeGetItem(`${PROPERTY_GROUP_STORAGE_PREFIX}${id}`);
  return stored === "open" ? true : stored === "closed" ? false : fallback;
}

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field-row"><span>{label}</span><input type="text" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
export function TextAreaField({ label, value, rows = 3, placeholder, onChange }: { label: string; value: string; rows?: number; placeholder?: string; onChange: (value: string) => void }) {
  return <label className="field-row field-row-textarea"><span>{label}</span><textarea rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}
export function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="field-row"><span>{label}</span><input type="number" min={min} max={max} step={step} value={Number(value.toFixed(1))} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
export function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="field-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
export function ColorField({ label, value, savedColors = [], onChange }: { label: string; value: string; savedColors?: SavedColor[]; onChange: (value: string) => void }) {
  return <label className="field-row color-field-row"><span>{label}</span><span className="color-control">
    <input type="color" value={isHexColor(value) ? value : "#000000"} onChange={(event) => onChange(event.target.value)} />
    <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
    <select value="" aria-label={`Cores salvas ${label}`} disabled={!savedColors.length} onChange={(event) => event.target.value && onChange(event.target.value)}>
      <option value="">{savedColors.length ? "Cores salvas" : "Sem cores salvas"}</option>
      {savedColors.map((item, index) => <option key={`${item.name}-${item.color}-${index}`} value={item.color}>{item.name} - {item.color}</option>)}
    </select>
  </span></label>;
}
export function RangeField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="field-row"><span>{label}</span><span className="range-control"><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /><output>{value.toFixed(2)}</output></span></label>;
}
export function SelectField<T extends string>({ label, value, options, labels, onChange }: { label: string; value: T; options: T[]; labels?: Partial<Record<T, string>>; onChange: (value: T) => void }) {
  return <label className="field-row"><span>{label}</span><select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as T)}>{options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}</select></label>;
}
export function isHexColor(value: string): boolean { return /^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value); }
