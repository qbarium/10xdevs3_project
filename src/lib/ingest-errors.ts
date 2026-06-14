// Wspólny mapping kodu błędu przebiegu klasyfikacji / ponowienia → czytelny komunikat PL (bez
// szczegółów technicznych — FR-026). Jedno źródło prawdy, używane przez modal ingestu (S-02) i
// dziennik sesji + inline retry (S-08) — zamiast duplikowanego `switch` w dwóch miejscach
// (spójnie z filozofią `labels.ts`: dane DB/kody po angielsku, prezentacja PL w jednej warstwie).
//
// Kody klasyfikacji: invalid_key, timeout, provider, contract, too_many_items, unknown.
// Kody guardu / ścieżki plikowej (S-08 retry): missing_key, storage, encoding, empty_file.
// Komunikat retry-specyficzny dla missing_key zwraca sam endpoint w polu `error` (UI woli go,
// gdy jest) — tu trzymamy wariant generyczny, dobry także dla modalu ingestu.

export function ingestErrorMessage(code: string | null): string {
  switch (code) {
    case "invalid_key":
      return "Klucz API OpenAI jest niepoprawny lub wygasł — sprawdź ustawienia w profilu.";
    case "timeout":
      return "Klasyfikacja przekroczyła limit czasu (60 s). Spróbuj ponownie.";
    case "provider":
      return "Dostawca AI jest chwilowo niedostępny. Spróbuj ponownie za chwilę.";
    case "contract":
      return "Otrzymaliśmy nieprawidłową odpowiedź od modelu. Spróbuj ponownie.";
    case "too_many_items":
      return "Wsad wygenerował zbyt wiele wpisów. Skróć tekst i spróbuj ponownie.";
    case "missing_key":
      return "Brak skonfigurowanego klucza API. Skonfiguruj klucz w profilu.";
    case "storage":
      return "Nie udało się pobrać pliku wsadu sesji. Spróbuj ponownie później.";
    case "encoding":
      return "Nie udało się odczytać pliku w obsługiwanym kodowaniu (UTF-8, Windows-1250).";
    case "empty_file":
      return "Plik nie zawierał treści do sklasyfikowania.";
    default:
      return "Coś poszło nie tak podczas klasyfikacji. Spróbuj ponownie.";
  }
}
