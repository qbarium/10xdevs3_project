// Współdzielony helper budowania odpowiedzi JSON dla endpointów API i rdzenia klasyfikacji
// (eliminacja zduplikowanej lokalnej funkcji `json` w classify.ts / retry.ts / classify-core.ts).

/** Buduje odpowiedź JSON z podanym kodem statusu i nagłówkiem Content-Type. */
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
