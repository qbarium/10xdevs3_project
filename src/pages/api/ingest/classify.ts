// Synchroniczna ścieżka klasyfikacji wsadu paste (S-02). Sekwencja (PRD cascade):
// guard locals.user → sanityzacja wsadu → klient Supabase (RLS) → odszyfrowanie klucza BYOK
// → sesja `processing` → classify() w AbortController(60 s) → atomowy zapis → mapowanie 4 stanów.
//
// Twarde 4xx/5xx tylko dla błędów ŻĄDANIA (brak auth/złe body/brak klucza/KEK). Błędy SAMEJ
// klasyfikacji zwracają 200 ze stanem `failed` — z perspektywy UI to jeden z czterech normalnych
// stanów przebiegu (FR-006), nie awaria transportu. Żaden komunikat ani log nie zawiera klucza
// ani treści wsadu (FR-026); logujemy wyłącznie metadane.

import type { APIRoute } from "astro";

import { classify } from "@/lib/ai/classifier";
import { AI_REQUEST_TIMEOUT_MS } from "@/lib/config/ai";
import { decryptApiKey } from "@/lib/services/byok-crypto";
import { createSession, failSession, finalizeEmpty, persistItems } from "@/lib/services/import-session";
import { logger, reportError } from "@/lib/services/logger";
import { getEncryptedApiKey } from "@/lib/services/profile-key";
import { createClient } from "@/lib/supabase";
import { INPUT_MAX_CHARS, sanitizeInput } from "@/lib/text/sanitize";
import {
  ClassifierAuthError,
  ClassifierContractError,
  ClassifierProviderError,
  KekNotConfiguredError,
  UnsupportedModelError,
} from "@/types";

export const prerender = false;

/** Techniczny safety net FR-020: > 100 itemów to anomalia, NIE limit produktowy widoczny dla usera. */
const MAX_ITEMS = 100;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Mapuje wyjątek klasyfikacji na krótki kod stanu UI (bez szczegółów wrażliwych). */
function mapClassifyError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") return "timeout";
  if (err instanceof ClassifierAuthError) return "invalid_key";
  if (err instanceof ClassifierProviderError) return "provider";
  if (err instanceof ClassifierContractError) return "contract";
  if (err instanceof UnsupportedModelError) return "unsupported_model";
  reportError(err); // nieoczekiwany błąd — zaloguj pełny (zamaskowany), zwróć generyczny kod
  return "unknown";
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, error: "Wymagane logowanie." }, 401);

  // Wsad: sanityzacja client-side i tu defensywnie (FR-002). Limit znaków = wyłącznie paste.
  let rawText: string;
  try {
    const body = (await context.request.json()) as { text?: unknown };
    rawText = typeof body.text === "string" ? sanitizeInput(body.text) : "";
  } catch {
    return json({ ok: false, error: "Nieprawidłowe żądanie." }, 400);
  }
  if (!rawText) return json({ ok: false, error: "Wsad nie może być pusty." }, 400);
  if (rawText.length > INPUT_MAX_CHARS) return json({ ok: false, error: "Wsad przekracza limit znaków." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, error: "Błąd serwera." }, 500);

  // Klucz BYOK: brak → 409 missing_key (US-06/FR-024); KEK niedostępny → 503 generyczny.
  let apiKey: string;
  try {
    const envelope = await getEncryptedApiKey(supabase, user.id);
    if (!envelope) {
      return json({ ok: false, code: "missing_key", error: "Brak skonfigurowanego klucza API." }, 409);
    }
    apiKey = await decryptApiKey(envelope);
  } catch (err) {
    if (err instanceof KekNotConfiguredError) {
      logger.warn("classify: KEK niedostępny");
      return json({ ok: false, error: "Usługa chwilowo niedostępna." }, 503);
    }
    reportError(err);
    return json({ ok: false, error: "Błąd serwera." }, 500);
  }

  // Sesja importu (audit trail). Tworzona PRZED klasyfikacją, by zachować wsad nawet przy błędzie.
  let sessionId: string;
  try {
    sessionId = (await createSession(supabase, user.id, rawText)).id;
  } catch (err) {
    reportError(err);
    return json({ ok: false, error: "Błąd serwera." }, 500);
  }

  // Klasyfikacja z twardym timeoutem 60 s (wall-clock fetch-wait). clearTimeout w finally.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, AI_REQUEST_TIMEOUT_MS);
  try {
    const items = await classify(rawText, { apiKey, userId: user.id, signal: controller.signal });

    if (items.length > MAX_ITEMS) {
      await failSession(supabase, sessionId, "too_many_items");
      logger.warn("classify: safety net > 100", { sessionId, count: items.length });
      return json({ ok: false, sessionId, status: "failed", code: "too_many_items" }, 422);
    }
    if (items.length === 0) {
      await finalizeEmpty(supabase, sessionId);
      return json({ ok: true, sessionId, status: "completed_no_items", itemCount: 0 }, 200);
    }
    const itemCount = await persistItems(supabase, sessionId, items);
    return json({ ok: true, sessionId, status: "completed_with_items", itemCount }, 200);
  } catch (err) {
    const code = mapClassifyError(err);
    try {
      await failSession(supabase, sessionId, code);
    } catch (failErr) {
      reportError(failErr); // nie maskuj pierwotnej przyczyny — to log dodatkowy
    }
    logger.warn("classify: failed", { sessionId, code });
    return json({ ok: true, sessionId, status: "failed", code }, 200);
  } finally {
    clearTimeout(timer);
  }
};
