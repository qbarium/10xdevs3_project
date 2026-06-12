// Synchroniczna ścieżka klasyfikacji wsadu (S-02). Jeden endpoint, dwa wejścia:
//   • paste — JSON { text } (PR1, Faza 3): limit INPUT_MAX_CHARS, raw_input = treść.
//   • plik  — multipart/form-data { file } (PR2, Faza 7): limit 300 KB ROZMIARU (nie znaków),
//             upload do storage + wiersz import_files, dekodowanie kodowań, raw_input = null.
// Po ustaleniu (sessionId, rawText) obie ścieżki schodzą się we wspólnym ogonie classifyAndRespond.
//
// Sekwencja (PRD cascade): guard locals.user → pozyskanie/walidacja wsadu → klient Supabase (RLS)
// → odszyfrowanie klucza BYOK → sesja `processing` (+ plik: upload + dekodowanie) → classify()
// w AbortController(60 s) → atomowy zapis → mapowanie 4 stanów.
//
// Twarde 4xx/5xx tylko dla błędów ŻĄDANIA (brak auth/złe body/zły typ/za duży plik/brak klucza/KEK).
// Błędy SAMEJ klasyfikacji oraz dekodowania/uploadu zwracają 200 ze stanem `failed` — z perspektywy
// UI to jeden z czterech normalnych stanów przebiegu (FR-006), nie awaria transportu. Żaden komunikat
// ani log nie zawiera klucza ani treści wsadu (FR-026); logujemy wyłącznie metadane.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { APIRoute } from "astro";

import { classify } from "@/lib/ai/classifier";
import { AI_REQUEST_TIMEOUT_MS } from "@/lib/config/ai";
import { decryptApiKey } from "@/lib/services/byok-crypto";
import { assertValidImportFile, MAX_FILE_BYTES, uploadImportFile } from "@/lib/services/file-upload";
import { createSession, failSession, finalizeEmpty, persistItems } from "@/lib/services/import-session";
import { logger, reportError } from "@/lib/services/logger";
import { getEncryptedApiKey } from "@/lib/services/profile-key";
import { createClient } from "@/lib/supabase";
import { decodeFile } from "@/lib/text/decode";
import { INPUT_MAX_CHARS, sanitizeInput } from "@/lib/text/sanitize";
import {
  ClassifierAuthError,
  ClassifierContractError,
  ClassifierProviderError,
  FileTooLargeError,
  KekNotConfiguredError,
  UnsupportedEncodingError,
  UnsupportedFileTypeError,
  UnsupportedModelError,
} from "@/types";

export const prerender = false;

/** Techniczny safety net FR-020: > 100 itemów to anomalia, NIE limit produktowy widoczny dla usera. */
const MAX_ITEMS = 100;

/** Margines na kopertę multipart (boundary + nagłówki części) doliczany do MAX_FILE_BYTES przy wczesnym odrzucie. */
const MULTIPART_ENVELOPE_MARGIN_BYTES = 16 * 1024;

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

/**
 * Wspólny ogon obu ścieżek: klasyfikuje wsad z twardym timeoutem 60 s (wall-clock fetch-wait) i
 * mapuje wynik na cztery stany sesji. Sesja istnieje już w stanie `processing` — błąd → failSession.
 * clearTimeout w finally.
 */
async function classifyAndRespond(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  rawText: string,
  apiKey: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, AI_REQUEST_TIMEOUT_MS);
  try {
    const items = await classify(rawText, { apiKey, userId, signal: controller.signal });

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
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, error: "Wymagane logowanie." }, 401);

  const isMultipart = (context.request.headers.get("content-type") ?? "").includes("multipart/form-data");

  // --- Pozyskanie + walidacja wsadu (bez tworzenia sesji). ---
  // Plik: tylko wstępna walidacja typu/rozmiaru tutaj (czysty 400 przed sesją). Upload i dekodowanie
  // dopiero po utworzeniu sesji (ścieżka obiektu potrzebuje session_id).
  let pasteText = "";
  let file: File | null = null;
  if (isMultipart) {
    // Wczesny, best-effort odrzut po Content-Length, zanim serwer zbuforuje całe ciało (guard DoS).
    // Content-Length obejmuje kopertę multipart, stąd margines. Dokładną walidację rozmiaru pliku robi
    // assertValidImportFile po formData(). Brak nagłówka (chunked) → Number(null)=0 → check się pomija.
    const declaredLength = Number(context.request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES + MULTIPART_ENVELOPE_MARGIN_BYTES) {
      return json({ ok: false, error: "Plik przekracza limit 300 KB." }, 413);
    }
    let field: FormDataEntryValue | null;
    try {
      field = (await context.request.formData()).get("file");
    } catch {
      return json({ ok: false, error: "Nieprawidłowe żądanie." }, 400);
    }
    if (!(field instanceof File)) return json({ ok: false, error: "Brak pliku w żądaniu." }, 400);
    try {
      assertValidImportFile(field);
    } catch (err) {
      if (err instanceof UnsupportedFileTypeError || err instanceof FileTooLargeError) {
        return json({ ok: false, error: err.message }, 400);
      }
      reportError(err);
      return json({ ok: false, error: "Błąd serwera." }, 500);
    }
    file = field;
  } else {
    try {
      const body = (await context.request.json()) as { text?: unknown };
      pasteText = typeof body.text === "string" ? sanitizeInput(body.text) : "";
    } catch {
      return json({ ok: false, error: "Nieprawidłowe żądanie." }, 400);
    }
    if (!pasteText) return json({ ok: false, error: "Wsad nie może być pusty." }, 400);
    if (pasteText.length > INPUT_MAX_CHARS) return json({ ok: false, error: "Wsad przekracza limit znaków." }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, error: "Błąd serwera." }, 500);

  // --- Klucz BYOK: brak → 409 missing_key (US-06/FR-024); KEK niedostępny → 503 generyczny. ---
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

  // --- Sesja importu (audit trail). Tworzona PRZED klasyfikacją, by zachować wsad nawet przy błędzie. ---
  let sessionId: string;
  let rawText: string;
  if (file) {
    // Ścieżka plikowa: sesja (raw_input null) → upload do storage + import_files → dekodowanie kodowań.
    try {
      sessionId = (await createSession(supabase, user.id, null)).id;
    } catch (err) {
      reportError(err);
      return json({ ok: false, error: "Błąd serwera." }, 500);
    }
    try {
      await uploadImportFile(supabase, user.id, sessionId, file);
    } catch (err) {
      reportError(err);
      await failSession(supabase, sessionId, "storage").catch((e: unknown) => {
        reportError(e);
      });
      logger.warn("classify: upload failed", { sessionId });
      return json({ ok: true, sessionId, status: "failed", code: "storage" }, 200);
    }
    // Dekodowanie UTF-8/BOM/Windows-1250. Limit pliku to 300 KB rozmiaru, NIE INPUT_MAX_CHARS znaków.
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      rawText = sanitizeInput(decodeFile(bytes).text);
    } catch (err) {
      const code = err instanceof UnsupportedEncodingError ? "encoding" : "unknown";
      if (code === "unknown") reportError(err);
      await failSession(supabase, sessionId, code).catch((e: unknown) => {
        reportError(e);
      });
      logger.warn("classify: decode failed", { sessionId, code });
      return json({ ok: true, sessionId, status: "failed", code }, 200);
    }
    if (!rawText) {
      await failSession(supabase, sessionId, "empty_file").catch((e: unknown) => {
        reportError(e);
      });
      logger.warn("classify: empty file", { sessionId });
      return json({ ok: true, sessionId, status: "failed", code: "empty_file" }, 200);
    }
  } else {
    rawText = pasteText;
    try {
      sessionId = (await createSession(supabase, user.id, rawText)).id;
    } catch (err) {
      reportError(err);
      return json({ ok: false, error: "Błąd serwera." }, 500);
    }
  }

  return classifyAndRespond(supabase, user.id, sessionId, rawText, apiKey);
};
