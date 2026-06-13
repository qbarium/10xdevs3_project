// Ponowienie klasyfikacji trwałej sesji `failed` bez ponownego wprowadzania wsadu (S-08, US-07,
// FR-027, retry-część FR-024). Reuse wiersza: ten sam `sessionId`, nadpisanie status/item_count/
// error_message — historia poprzedniej próby nie jest zachowywana (świadoma decyzja planu).
//
// Sekwencja guardów (twardy 4xx tylko dla błędów ŻĄDANIA): auth → walidacja body → własność/RLS →
// status=failed → re-check klucza BYOK (FR-024) → odtworzenie wsadu (paste/plik) → warunkowy reopen
// (atomowy guard TOCTOU) → współdzielony rdzeń klasyfikacji. Błędy odtworzenia wsadu oraz samej
// klasyfikacji zwracają 200 ze stanem `failed` (jak ingest) — to normalny wynik przebiegu (FR-006),
// nie awaria transportu. Żaden komunikat/log nie zawiera klucza ani treści wsadu (FR-026).

import type { APIRoute } from "astro";

import { classifyResultToResponse, runClassification } from "@/lib/ai/classify-core";
import { decryptApiKey } from "@/lib/services/byok-crypto";
import { failSession, getSessionForRetry, reopenSession } from "@/lib/services/import-session";
import { logger, reportError } from "@/lib/services/logger";
import { getEncryptedApiKey } from "@/lib/services/profile-key";
import { loadSessionInput, SessionInputStorageError } from "@/lib/services/session-input";
import { createClient } from "@/lib/supabase";
import { KekNotConfiguredError, UnsupportedEncodingError } from "@/types";

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, error: "Wymagane logowanie." }, 401);

  // Body: pojedyncze pole skalarne { sessionId } → walidacja ręczna (hard rule + lessons.md:
  // złożone/wielopolowe → zod; pojedynczy skalar → trim + odrzucenie pustego).
  let sessionId: string;
  try {
    const body = (await context.request.json()) as { sessionId?: unknown };
    sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  } catch {
    return json({ ok: false, error: "Nieprawidłowe żądanie." }, 400);
  }
  if (!sessionId) return json({ ok: false, error: "Brak identyfikatora sesji." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, error: "Błąd serwera." }, 500);

  // Własność + istnienie: RLS odfiltruje cudzą sesję → brak wiersza → 404 (nie ujawniamy istnienia).
  let session;
  try {
    session = await getSessionForRetry(supabase, user.id, sessionId);
  } catch (err) {
    reportError(err);
    return json({ ok: false, error: "Błąd serwera." }, 500);
  }
  if (!session) return json({ ok: false, error: "Sesja nie istnieje." }, 404);

  // Ponawialne są wyłącznie sesje `failed` (reuse modelu failed → processing → wynik).
  if (session.status !== "failed") {
    return json({ ok: false, code: "not_retryable", error: "Tej sesji nie można ponowić." }, 409);
  }

  // FR-024: re-check klucza BYOK PRZED reopenem/klasyfikacją (klucz mógł zniknąć między błędem a retry).
  let apiKey: string;
  try {
    const envelope = await getEncryptedApiKey(supabase, user.id);
    if (!envelope) {
      return json(
        {
          ok: false,
          code: "missing_key",
          error: "Klucz API został usunięty z profilu — skonfiguruj nowy klucz przed ponowieniem.",
        },
        409,
      );
    }
    apiKey = await decryptApiKey(envelope);
  } catch (err) {
    if (err instanceof KekNotConfiguredError) {
      logger.warn("retry: KEK niedostępny");
      return json({ ok: false, error: "Usługa chwilowo niedostępna." }, 503);
    }
    reportError(err);
    return json({ ok: false, error: "Błąd serwera." }, 500);
  }

  // Odtworzenie wsadu (paste z raw_input / plik ze Storage). Błąd → sesja zostaje `failed` z nowym
  // kodem; nie reopenujemy ani nie klasyfikujemy.
  let text: string;
  try {
    text = await loadSessionInput(supabase, session);
  } catch (err) {
    const code =
      err instanceof UnsupportedEncodingError
        ? "encoding"
        : err instanceof SessionInputStorageError
          ? "storage"
          : "unknown";
    if (code === "unknown") reportError(err);
    await failSession(supabase, sessionId, code).catch((e: unknown) => {
      reportError(e);
    });
    logger.warn("retry: odtworzenie wsadu nie powiodło się", { sessionId, code });
    return classifyResultToResponse(sessionId, { status: "failed", code });
  }
  if (!text) {
    await failSession(supabase, sessionId, "empty_file").catch((e: unknown) => {
      reportError(e);
    });
    logger.warn("retry: pusty wsad po odtworzeniu", { sessionId });
    return classifyResultToResponse(sessionId, { status: "failed", code: "empty_file" });
  }

  // Warunkowy reopen (failed → processing) jako atomowy guard TOCTOU: false = równoległe ponowienie
  // wygrało wyścig → 409 (nie klasyfikujemy drugi raz, brak zdublowanych itemów).
  let reopened: boolean;
  try {
    reopened = await reopenSession(supabase, sessionId);
  } catch (err) {
    reportError(err);
    return json({ ok: false, error: "Błąd serwera." }, 500);
  }
  if (!reopened) {
    return json({ ok: false, code: "not_retryable", error: "Sesja jest właśnie ponawiana." }, 409);
  }

  // Reuse wiersza: ten sam sessionId. Współdzielony rdzeń + jedyny mapper HTTP (identyczny z ingest).
  const result = await runClassification(supabase, { sessionId, apiKey, userId: user.id, text });
  return classifyResultToResponse(sessionId, result);
};
