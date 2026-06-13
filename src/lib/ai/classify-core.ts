// Współdzielony rdzeń klasyfikacji wsadu (S-02 + S-08). Oba endpointy — ingest (`/api/ingest/classify`)
// i ponowienie (`/api/import-sessions/retry`) — wołają TEN SAM rdzeń na istniejącym `sessionId`, bez
// rozjazdu logiki klasyfikacji ANI mapowania HTTP w dwóch miejscach.
//
// Rozdział odpowiedzialności (decyzja z /10x-plan-review, F1):
//   • runClassification        — czysta logika: timeout 60 s + classify() + persist/finalize/fail.
//                                Zwraca WARTOŚĆ (ClassificationResult), jest HTTP-agnostyczny.
//   • classifyResultToResponse — JEDYNE miejsce mapowania wyniku na Response (kody HTTP + flaga ok).
//                                Oba endpointy go wołają → identyczny kontrakt HTTP, w tym 422/ok:false
//                                dla too_many_items (regresja-strażnik: classify.test.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

import { classify } from "@/lib/ai/classifier";
import { AI_REQUEST_TIMEOUT_MS } from "@/lib/config/ai";
import { failSession, finalizeEmpty, persistItems } from "@/lib/services/import-session";
import { logger, reportError } from "@/lib/services/logger";
import type { ImportSessionStatus } from "@/types";
import { ClassifierAuthError, ClassifierContractError, ClassifierProviderError, UnsupportedModelError } from "@/types";

/** Techniczny safety net FR-020: > 100 itemów to anomalia, NIE limit produktowy widoczny dla usera. */
const MAX_ITEMS = 100;

/** Wynik rdzenia klasyfikacji — czysta wartość, bez pojęć HTTP. */
export interface ClassificationResult {
  status: ImportSessionStatus;
  itemCount?: number;
  code?: string;
}

/** Parametry rdzenia: sesja istnieje już w stanie `processing`, klucz odszyfrowany, wsad gotowy. */
export interface RunClassificationParams {
  sessionId: string;
  apiKey: string;
  userId: string;
  text: string;
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

/**
 * Klasyfikuje wsad z twardym timeoutem 60 s (wall-clock fetch-wait) i mapuje wynik na cztery stany
 * sesji, utrwalając go atomowo. Sesja istnieje już w stanie `processing` — błąd → failSession.
 * clearTimeout w finally. Zwraca opis stanu; budowę odpowiedzi HTTP robi classifyResultToResponse.
 */
export async function runClassification(
  supabase: SupabaseClient,
  { sessionId, apiKey, userId, text }: RunClassificationParams,
): Promise<ClassificationResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, AI_REQUEST_TIMEOUT_MS);
  try {
    const items = await classify(text, { apiKey, userId, signal: controller.signal });

    if (items.length > MAX_ITEMS) {
      await failSession(supabase, sessionId, "too_many_items");
      logger.warn("classify: safety net > 100", { sessionId, count: items.length });
      return { status: "failed", code: "too_many_items" };
    }
    if (items.length === 0) {
      await finalizeEmpty(supabase, sessionId);
      return { status: "completed_no_items", itemCount: 0 };
    }
    const itemCount = await persistItems(supabase, sessionId, items);
    return { status: "completed_with_items", itemCount };
  } catch (err) {
    const code = mapClassifyError(err);
    try {
      await failSession(supabase, sessionId, code);
    } catch (failErr) {
      reportError(failErr); // nie maskuj pierwotnej przyczyny — to log dodatkowy
    }
    logger.warn("classify: failed", { sessionId, code });
    return { status: "failed", code };
  } finally {
    clearTimeout(timer);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Jedyne miejsce mapowania wyniku klasyfikacji na odpowiedź HTTP — współdzielone przez ingest i retry.
 * `too_many_items` → 422 z `ok:false` (techniczny safety net, NIE normalny stan przebiegu); pozostałe
 * stany (włącznie z `failed` z klasyfikacji) → 200 z `ok:true`, bo z perspektywy UI to jeden z czterech
 * normalnych wyników (FR-006), nie awaria transportu. Kontrakt identyczny z historycznym classify.ts.
 */
export function classifyResultToResponse(sessionId: string, result: ClassificationResult): Response {
  if (result.code === "too_many_items") {
    return json({ ok: false, sessionId, status: "failed", code: "too_many_items" }, 422);
  }
  if (result.status === "completed_no_items") {
    return json({ ok: true, sessionId, status: "completed_no_items", itemCount: 0 }, 200);
  }
  if (result.status === "completed_with_items") {
    return json({ ok: true, sessionId, status: "completed_with_items", itemCount: result.itemCount }, 200);
  }
  // failed (błąd klasyfikacji/dekodowania) — 200 ze stanem failed i kodem przyczyny.
  return json({ ok: true, sessionId, status: "failed", code: result.code }, 200);
}
