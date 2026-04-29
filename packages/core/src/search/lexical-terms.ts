export function tokenizeQuery(query: string): string[] {
  const terms = query
    .split(/\s+/)
    .flatMap((raw) => (raw.trim().startsWith("#") ? tokenizeTag(raw) : tokenizeText(raw)));

  return uniqueTerms(terms);
}

export function tokenizeText(value: string): string[] {
  return uniqueTerms(normalizeSearchText(value).split(/[^a-z0-9]+/).filter(Boolean));
}

export function tokenizeTag(value: string): string[] {
  const tag = normalizeTag(value);
  if (!tag) return [];
  return uniqueTerms([tag, ...tag.split("/").filter(Boolean)]);
}

function normalizeTag(value: string): string {
  return normalizeSearchText(value)
    .replace(/^#+/, "")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .join("/");
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms.filter(Boolean))];
}
