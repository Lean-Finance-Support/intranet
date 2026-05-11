import type { SearchDestination } from "./types";

const ACCENT_MAP: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n",
  Á: "a", É: "e", Í: "i", Ó: "o", Ú: "u", Ñ: "n",
  ü: "u", Ü: "u",
};

export function normalize(value: string): string {
  return value
    .split("")
    .map((ch) => ACCENT_MAP[ch] ?? ch)
    .join("")
    .toLowerCase()
    .trim();
}

function tokenize(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/**
 * Score por substring de cada token de la query contra label/sublabel/keywords.
 * - 0 = no match (se descarta)
 * - Bonus si match al inicio del label.
 * - Bonus si match en una palabra completa (límite de palabra).
 * Todos los tokens deben matchear en algún campo (AND).
 */
export function scoreDestination(destination: SearchDestination, query: string): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 1;

  const label = normalize(destination.label);
  const sublabel = destination.sublabel ? normalize(destination.sublabel) : "";
  const keywords = destination.keywords.map(normalize);

  let total = 0;
  for (const token of tokens) {
    let best = 0;

    const labelIdx = label.indexOf(token);
    if (labelIdx >= 0) {
      let bonus = 50;
      if (labelIdx === 0) bonus += 30;
      else if (label[labelIdx - 1] === " ") bonus += 15;
      best = Math.max(best, bonus);
    }

    if (sublabel) {
      const idx = sublabel.indexOf(token);
      if (idx >= 0) best = Math.max(best, idx === 0 ? 30 : 20);
    }

    for (const kw of keywords) {
      const idx = kw.indexOf(token);
      if (idx >= 0) {
        best = Math.max(best, idx === 0 ? 25 : 15);
      }
    }

    if (best === 0) return 0;
    total += best;
  }

  return total;
}

export function rankDestinations(
  destinations: SearchDestination[],
  query: string,
  limitPerGroup = 8,
): SearchDestination[] {
  const scored: Array<{ d: SearchDestination; score: number }> = [];
  for (const d of destinations) {
    const score = scoreDestination(d, query);
    if (score > 0) scored.push({ d, score });
  }
  scored.sort((a, b) => b.score - a.score || a.d.label.localeCompare(b.d.label));

  const perGroup = new Map<string, number>();
  const out: SearchDestination[] = [];
  for (const { d } of scored) {
    const count = perGroup.get(d.group) ?? 0;
    if (count >= limitPerGroup) continue;
    perGroup.set(d.group, count + 1);
    out.push(d);
  }
  return out;
}
