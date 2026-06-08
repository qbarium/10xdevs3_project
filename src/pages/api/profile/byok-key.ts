// REST klucza BYOK w profilu: zapis / status / usunięcie. Bramkowany sesją (`locals.user`),
// klient Supabase z cookies usera (RLS egzekwuje izolację — bez service_role). Wszystkie błędy
// są generyczne i NIGDY nie zawierają materiału klucza; klucz nie trafia do żadnego pola
// `logger.*`/`reportError` ani do treści odpowiedzi (FR-026). Szyfrowanie jest fail-closed:
// `KekNotConfiguredError` → 503 generyczny, pozostałe → 500 generyczny.

import type { APIRoute } from "astro";

import { createClient } from "@/lib/supabase";
import { logger, reportError } from "@/lib/services/logger";
import { deleteApiKey, getKeyStatus, saveApiKey } from "@/lib/services/profile-key";
import { KekNotConfiguredError } from "@/types";

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

  let apiKey: string;
  try {
    const body = (await context.request.json()) as { apiKey?: unknown };
    apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  } catch {
    return json({ ok: false, error: "Nieprawidłowe żądanie." }, 400);
  }
  if (!apiKey) return json({ ok: false, error: "Klucz nie może być pusty." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, error: "Błąd serwera." }, 500);

  try {
    const status = await saveApiKey(supabase, user.id, apiKey);
    return json({ ok: true, ...status }, 200);
  } catch (err) {
    if (err instanceof KekNotConfiguredError) {
      // Bez pola klucza — sam fakt niedostępności KEK.
      logger.warn("BYOK save: KEK niedostępny");
      return json({ ok: false, error: "Usługa chwilowo niedostępna." }, 503);
    }
    reportError(err);
    return json({ ok: false, error: "Błąd serwera." }, 500);
  }
};

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, error: "Wymagane logowanie." }, 401);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, error: "Błąd serwera." }, 500);

  try {
    const status = await getKeyStatus(supabase, user.id);
    return json(status, 200);
  } catch (err) {
    reportError(err);
    return json({ ok: false, error: "Błąd serwera." }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, error: "Wymagane logowanie." }, 401);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, error: "Błąd serwera." }, 500);

  try {
    await deleteApiKey(supabase, user.id);
    return json({ ok: true, configured: false }, 200);
  } catch (err) {
    reportError(err);
    return json({ ok: false, error: "Błąd serwera." }, 500);
  }
};
