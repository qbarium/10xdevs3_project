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

/**
 * Allowlista hostów, do których wolno wysłać odszyfrowany klucz BYOK (nagłówek Authorization).
 * Trzymana w KODZIE, nie w env — to granica bezpieczeństwa: wroga/błędna konfiguracja env nie może
 * jej rozszerzyć. Proxy/gateway zgodny z API dodaj świadomą zmianą kodu (F2 z /10x-impl-review).
 */
const ALLOWED_OPENAI_HOSTS = ["api.openai.com"] as const;

/** Błąd konfiguracji warstwy LLM — fail-closed (jak brak soli/KEK): usługa odmawia zamiast ryzykować. */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

/**
 * Waliduje OPENAI_BASE_URL fail-closed: poprawny URL, schemat https i host na allowliście. Chroni
 * odszyfrowany klucz BYOK przed egress do wrogiego/błędnie skonfigurowanego hosta (F2). Komunikat
 * nie zawiera klucza ani treści wsadu (FR-026) — tylko sam host konfiguracji.
 */
function assertSafeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AiConfigError("OPENAI_BASE_URL nie jest poprawnym URL.");
  }
  if (url.protocol !== "https:") {
    throw new AiConfigError("OPENAI_BASE_URL musi używać https (ochrona egress klucza BYOK).");
  }
  if (!(ALLOWED_OPENAI_HOSTS as readonly string[]).includes(url.hostname)) {
    throw new AiConfigError(`Host OPENAI_BASE_URL "${url.hostname}" spoza allowlisty egress.`);
  }
  return raw;
}

/**
 * store:false to inwariant prywatności (treść wsadu nieretencjonowana po stronie OpenAI). Asercja
 * fail-closed: OPENAI_STORE=true wywróci config zamiast cicho złamać guardrail (F2).
 */
function assertNoStore(store: boolean): false {
  if (store) {
    throw new AiConfigError("OPENAI_STORE musi być false — store:true narusza inwariant prywatności wsadu.");
  }
  return false;
}

/** Parametry warstwy LLM odczytane z env (z domyślnymi z envField); pola wrażliwe walidowane fail-closed. */
export const aiConfig = {
  model: CLASSIFIER_MODEL,
  baseUrl: assertSafeBaseUrl(OPENAI_BASE_URL),
  temperature: OPENAI_TEMPERATURE,
  maxTokens: OPENAI_MAX_TOKENS,
  store: assertNoStore(OPENAI_STORE),
} as const;
