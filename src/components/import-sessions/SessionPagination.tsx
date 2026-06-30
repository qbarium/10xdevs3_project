// Kontrolki stron dziennika sesji (S-11): pierwsza/poprzednia + wpisanie konkretnej strony + następna/ostatnia.
// KONTROLOWANE przez rodzica (`page`/`pageCount` z hooka `useSessionList`). Pole strony jest NIEKONTROLOWANE
// (`defaultValue` + `key={page}`): pozwala wpisać kilka cyfr przed zatwierdzeniem, a `key` wymusza remount, gdy
// strona zmieni się z zewnątrz (przyciski, reset filtra) — bez `useState`/`useEffect` (omija
// react-hooks/set-state-in-effect). Commit na Enter/blur przez `clampPage` (parsowanie + clamp do [1, pageCount];
// puste → bieżąca strona). Przy jednej stronie (pageCount ≤ 1) nie renderuje nic.

import type { ChangeEvent, KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { clampPage, pageNav } from "@/components/import-sessions/session-pagination";

interface Props {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}

const NAV_BUTTON = "rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10";

export default function SessionPagination({ page, pageCount, onPage }: Props) {
  if (pageCount <= 1) return null;
  const nav = pageNav(page, pageCount);

  // Zatwierdzenie wpisanej strony: puste → bieżąca (nie skacze na 1), inaczej clamp do [1, pageCount]. Wartość
  // pola zawsze odświeżamy do rozstrzygniętej strony; nawigujemy tylko przy realnej zmianie.
  function commit(el: HTMLInputElement) {
    const raw = el.value.trim();
    const next = raw === "" ? page : clampPage(Number(raw), pageCount, page);
    el.value = String(next);
    if (next !== page) onPage(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(event.currentTarget);
    }
  }

  // Spinner (strzałki ▲▼) i ↑/↓ na polu to KROK — zdarzenie bez `inputType` → nawiguj NATYCHMIAST. Wpisywanie
  // znaku (`insertText` / `deleteContent…`) zostawiamy do Enter/blur, by nie fetchować i nie pchać historii
  // na każdą wpisaną cyfrę („12" nie ma najpierw skakać na stronę 1).
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (!(event.nativeEvent as InputEvent).inputType) {
      commit(event.currentTarget);
    }
  }

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-2 text-sm text-white/70"
      aria-label="Paginacja sesji"
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="Pierwsza strona"
        disabled={!nav.canPrev}
        onClick={() => {
          onPage(1);
        }}
        className={NAV_BUTTON}
      >
        «
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="Poprzednia strona"
        disabled={!nav.canPrev}
        onClick={() => {
          onPage(nav.prevPage);
        }}
        className={NAV_BUTTON}
      >
        ‹
      </Button>

      <span className="flex items-center gap-1.5 whitespace-nowrap">
        strona
        <input
          key={page}
          type="number"
          min={1}
          max={pageCount}
          inputMode="numeric"
          aria-label="Numer strony"
          defaultValue={page}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            commit(event.currentTarget);
          }}
          className="w-14 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-center text-white/90 tabular-nums focus:border-purple-300/50 focus:outline-none"
        />
        z <span className="tabular-nums">{pageCount}</span>
      </span>

      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="Następna strona"
        disabled={!nav.canNext}
        onClick={() => {
          onPage(nav.nextPage);
        }}
        className={NAV_BUTTON}
      >
        ›
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="Ostatnia strona"
        disabled={!nav.canNext}
        onClick={() => {
          onPage(pageCount);
        }}
        className={NAV_BUTTON}
      >
        »
      </Button>
    </nav>
  );
}
