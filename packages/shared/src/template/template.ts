import type { FieldMap, FieldValue } from './fields.js';

const TOKEN = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export interface ResolvedTemplate {
  output: string;
  missing: string[];
}

export function templateReferences(template: string): string[] {
  return [...new Set(Array.from(template.matchAll(TOKEN), (match) => match[1] ?? ''))];
}

function render(value: FieldValue): string {
  return value === null ? '' : String(value);
}

export function resolveTemplate(template: string, fields: FieldMap): ResolvedTemplate {
  const missing = new Set<string>();
  const output = template.replace(TOKEN, (_token, key: string) => {
    const value = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (value === undefined || value === null) {
      missing.add(key);
      return '';
    }
    return render(value);
  });
  return { output, missing: [...missing] };
}
