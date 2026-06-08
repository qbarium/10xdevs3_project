// Serwis klucza BYOK w profilu: hermetyzuje szyfrowanie (F-01), liczenie hintu, upsert,
// odczyt statusu i usunięcie — nad klientem Supabase z RLS (cookies usera, nie service_role).
// NIGDY nie selektuje `api_key_encrypted` do warstwy odpowiedzi i nie zwraca pełnego klucza:
// klient dostaje wyłącznie `hint`. Deszyfracja nie jest potrzebna w S-01 (podgląd z hintu).

import type { SupabaseClient } from "@supabase/supabase-js";

import { encryptApiKey } from "@/lib/services/byok-crypto";
import { maskKeyForDisplay } from "@/lib/services/byok-display";
import type { ByokKeyStatus, Profile } from "@/types";

/**
 * Zapisuje klucz: szyfruje (fail-closed PRZED upsertem — jeśli `encryptApiKey` rzuci, nic nie
 * trafia do DB), liczy hint, upsertuje wiersz (leniwe tworzenie). Zwraca status bez koperty.
 */
export async function saveApiKey(supabase: SupabaseClient, userId: string, plain: string): Promise<ByokKeyStatus> {
  const encrypted = await encryptApiKey(plain);
  const hint = maskKeyForDisplay(plain);
  const updatedAt = new Date().toISOString();

  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      api_key_encrypted: encrypted,
      api_key_hint: hint,
      api_key_updated_at: updatedAt,
    },
    { onConflict: "id" },
  );
  // Komunikat bez materiału klucza; surowy błąd Postgrest jako `cause` (logger go zamaskuje).
  if (error) throw new Error("Zapis klucza w profilu nie powiódł się.", { cause: error });

  return { configured: true, hint, updatedAt };
}

/**
 * Status klucza dla wiersza usera. Brak wiersza LUB wyzerowany hint → `configured:false`
 * (idempotentne na braku wiersza — leniwy upsert oznacza, że brak wiersza to stan normalny).
 */
export async function getKeyStatus(supabase: SupabaseClient, userId: string): Promise<ByokKeyStatus> {
  const { data, error } = await supabase
    .from("profiles")
    .select("api_key_hint, api_key_updated_at")
    .eq("id", userId)
    .maybeSingle<Pick<Profile, "api_key_hint" | "api_key_updated_at">>();
  if (error) throw new Error("Odczyt statusu klucza nie powiódł się.", { cause: error });

  if (!data?.api_key_hint) {
    return { configured: false, hint: null, updatedAt: null };
  }
  return { configured: true, hint: data.api_key_hint, updatedAt: data.api_key_updated_at };
}

/**
 * Usuwa klucz: zeruje kolumny (UPDATE, nie DELETE wiersza). Idempotentne — na braku wiersza
 * UPDATE dopasowuje 0 wierszy bez błędu.
 */
export async function deleteApiKey(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ api_key_encrypted: null, api_key_hint: null, api_key_updated_at: null })
    .eq("id", userId);
  if (error) throw new Error("Usunięcie klucza nie powiodło się.", { cause: error });
}
