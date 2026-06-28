// Kontrolki stron dziennika sesji (S-11): poprzednia/następna + wskaźnik „strona X z Y". KONTROLOWANE —
// rodzic (wyspa) trzyma `page`/`pageCount` z hooka `useSessionList`, komponent nie ma własnego stanu. Przy
// jednej stronie (pageCount ≤ 1) nie renderuje nic (brak wizualnego szumu). Logika krańców w `pageNav`.

import { Button } from "@/components/ui/button";
import { pageNav } from "@/components/import-sessions/session-pagination";

interface Props {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}

export default function SessionPagination({ page, pageCount, onPage }: Props) {
  if (pageCount <= 1) return null;
  const nav = pageNav(page, pageCount);
  return (
    <nav className="flex items-center justify-center gap-3 text-sm text-white/70" aria-label="Paginacja sesji">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!nav.canPrev}
        onClick={() => {
          onPage(nav.prevPage);
        }}
        className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
      >
        ← Poprzednia
      </Button>
      <span className="whitespace-nowrap tabular-nums" aria-live="polite">
        strona {page} z {pageCount}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!nav.canNext}
        onClick={() => {
          onPage(nav.nextPage);
        }}
        className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
      >
        Następna →
      </Button>
    </nav>
  );
}
