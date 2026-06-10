// Rozwiązana konfiguracja warstwy LLM (S-02): czyta parametry z astro:env/server.
// Sekret (sól FR-025) żyje osobno w user-hash.ts. Domyślne wartości pochodzą z envField
// (astro.config.mjs); ten moduł tylko je odczytuje i wystawia jako jeden obiekt config.
// CLASSIC_MODELS celowo NIE tutaj, a w resolver.ts (jego domena: model → endpoint).

import {
  CLASSIFIER_MODEL,
  OPENAI_BASE_URL,
  OPENAI_TEMPERATURE,
  OPENAI_MAX_TOKENS,
  OPENAI_STORE,
} from "astro:env/server";

/**
 * Timeout całej klasyfikacji (wall-clock fetch-wait), egzekwowany przez AbortController
 * w endpointcie (Faza 3). 60 s wg PRD (US-01, NFR). To nie czas CPU (Workers Free OK).
 */
export const AI_REQUEST_TIMEOUT_MS = 60_000;

/** Parametry warstwy LLM odczytane z env (z domyślnymi z envField). */
export const aiConfig = {
  model: CLASSIFIER_MODEL,
  baseUrl: OPENAI_BASE_URL,
  temperature: OPENAI_TEMPERATURE,
  maxTokens: OPENAI_MAX_TOKENS,
  store: OPENAI_STORE,
} as const;
