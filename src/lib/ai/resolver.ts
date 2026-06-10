// Resolver endpointu: z nazwy modelu wybiera ścieżkę — bez override w configu (wytyczne §4).
// Czysta funkcja, BEZ importu astro:env → unit-testowalna wprost (bez mocka env).
// CLASSIC_MODELS to zamknięty, wyliczony zbiór; nowy model klasyczny = dopisanie tutaj.

/** Zamknięty zbiór modeli klasycznych → Chat Completions (wytyczne §4). Warianty z datą łapie prefiks. */
export const CLASSIC_MODELS: readonly string[] = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
];

export type EndpointKind = "chat" | "responses" | "mock";

/**
 * Wybiera ścieżkę endpointu z nazwy modelu (bez wielkości liter):
 * `mock` → mock (szew E2E); nazwa w CLASSIC_MODELS (lub jej wariant z datą) → chat; reszta → responses.
 */
export function resolveEndpoint(model: string): { kind: EndpointKind } {
  const m = model.toLowerCase();
  if (m === "mock") {
    return { kind: "mock" };
  }
  const isClassic = CLASSIC_MODELS.some((c) => m === c || m.startsWith(`${c}-`));
  return { kind: isClassic ? "chat" : "responses" };
}
