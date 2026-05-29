type LocalizedName = string | Record<string, string>;

/** Returns the best display name for a given language (falls back to de → en → first value). */
export function getLocalizedName(raw: LocalizedName | undefined, lang?: string): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (lang && raw[lang]) return raw[lang];
  return raw.de || raw.en || Object.values(raw)[0] || '';
}

/** Joins all language variants for full-text search scoring. */
export function getAllNamesForSearch(raw: LocalizedName | undefined): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  return Object.values(raw).join(' ');
}
