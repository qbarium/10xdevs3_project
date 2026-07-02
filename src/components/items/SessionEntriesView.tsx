// Widok trybu sesji (S-13 F4) na `/items?session=<id>` — rejestr wpisów JEDNEJ sesji importu zbudowany
// wyłącznie ze wspólnych klocków: `useItemList` (gałąź sesyjna `buildListUrl`), `ItemCard`, `EditItemDialog`,
// kontrolki stron. Polityka „rejestr" (vs „kolejka" widoków głównych): wpis po akcji ZOSTAJE w miejscu —
// akceptuj/odrzuć/przywróć podmieniają PEŁNY ŚWIEŻY wiersz z serwera (poprawny `updated_at` → edycja zaraz
// po akcji bez fałszywego 409, decyzja S-03/S-05), a „Do kosza" zmienia status lokalnie (wpis staje się
// read-only, edycja po niej nie następuje — wzorzec panelu S-10). Sort stały `created_at ASC` (endpoint),
// więc żadna akcja nie przesuwa wiersza. Bez zaznaczania zbiorczego i bez „Dodaj item" (bez sensu w trybie:
// tworzyłby wpis bez sesji). Pasek filtrów wyszarzony (`disabled`) — aktywne tylko „Wyczyść filtry".

import { useState } from "react";
import { toast } from "sonner";

import { useItemList } from "@/components/hooks/useItemList";
import { useItemMutation } from "@/components/hooks/useItemMutation";
import EditItemDialog from "@/components/items/EditItemDialog";
import ItemCard from "@/components/items/ItemCard";
import ListFilterBar from "@/components/items/ListFilterBar";
import { ITEMS_LIST_PAGE_SIZE_KEY, writePageSizePref } from "@/components/lists/page-size-pref";
import PageSizeSelect from "@/components/lists/PageSizeSelect";
import Pagination from "@/components/lists/Pagination";
import { resetToFirstPage } from "@/components/lists/list-pagination";
import { Toaster } from "@/components/ui/sonner";
import { ITEM_PAGE_SIZES } from "@/lib/services/list-criteria";
import type { ListCriteria } from "@/lib/services/list-criteria";
import type { Item } from "@/types";

interface Props {
  initialItems: Item[];
  /** Kryteria z adresu strony (z `session`; SERWEROWO tym samym parserem co klient — hydration-stable). */
  initialCriteria: ListCriteria;
  /** Łączna liczba wpisów sesji (SSR z `count`) — stan startowy licznika stron. */
  initialTotal: number;
}

export default function SessionEntriesView({ initialItems, initialCriteria, initialTotal }: Props) {
  const { items, criteria, settledCriteria, setCriteria, applyOptimistic, error, page, pageCount } = useItemList(
    initialCriteria.view,
    initialItems,
    initialCriteria,
    initialTotal,
  );
  const { acceptItems, rejectItems, moveToTrash, restoreFromTrashItems } = useItemMutation();
  // Jeden dialog dla edycji i podglądu — `readOnly` rozróżnia tryb; `key={item.id}` u dołu resetuje pola.
  const [dialogItem, setDialogItem] = useState<Item | null>(null);
  const [dialogReadOnly, setDialogReadOnly] = useState(false);
  // Wpis w locie (mutacja trwa) — wyszarzony do odpowiedzi, by uniknąć podwójnej akcji (wzorzec panelu).
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());

  function markInFlight(id: string, on: boolean): void {
    setInFlightIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Podmiana PEŁNEGO świeżego wiersza w miejscu (przez applyOptimistic hooka — lista należy do niego;
  // długość listy bez zmian, więc korekta `total` w hooku jest neutralna, a auto-cofnięcie strony nie rusza).
  function replaceRow(row: Item): void {
    applyOptimistic((prev) => prev.map((it) => (it.id === row.id ? row : it)));
  }

  // Wspólny przebieg akcji zwracających świeże wiersze (akceptuj / odrzuć / przywróć): blokada podwójnej
  // akcji per wpis, podmiana świeżego wiersza po `id`, toasty jak w panelu S-10.
  async function runRowAction(
    item: Item,
    action: () => Promise<Item[] | null>,
    successMessage: string,
    errorMessage: string,
  ): Promise<void> {
    if (inFlightIds.has(item.id)) return;
    markInFlight(item.id, true);
    const rows = await action();
    markInFlight(item.id, false);
    if (rows === null) {
      toast.error(errorMessage);
      return;
    }
    const row = rows.find((it) => it.id === item.id);
    if (row) {
      replaceRow(row);
      toast.success(successMessage);
    } else {
      toast("Element był już nieaktualny — odśwież widok.");
    }
  }

  // Kosz: accepted → deleted. Wpis ZOSTAJE na liście (sesja to scope, nie widok), przechodzi na read-only —
  // wystarczy lokalna zmiana statusu (świeży wiersz niepotrzebny: wpis nie jest już edytowalny).
  async function handleTrash(item: Item): Promise<void> {
    if (inFlightIds.has(item.id)) return;
    markInFlight(item.id, true);
    const count = await moveToTrash([item.id]);
    markInFlight(item.id, false);
    if (count === null) {
      toast.error("Nie udało się przenieść do kosza. Spróbuj ponownie.");
      return;
    }
    if (count > 0) {
      applyOptimistic((prev) => prev.map((it) => (it.id === item.id ? { ...it, acceptance_status: "deleted" } : it)));
      toast.success("Przeniesiono do kosza.");
    } else {
      toast("Element był już nieaktualny — odśwież widok.");
    }
  }

  function openEdit(item: Item): void {
    setDialogReadOnly(false);
    setDialogItem(item);
  }

  function openPreview(item: Item): void {
    setDialogReadOnly(true);
    setDialogItem(item);
  }

  // Ponów ostatni fetch wg bieżących kryteriów (po błędzie sieci).
  function retry(): void {
    setCriteria({ ...criteria });
  }

  return (
    <div className="flex flex-col gap-3">
      <Toaster />

      {/* Pasek filtrów wyszarzony — kontrolki nieaktywne, „Wyczyść filtry" wychodzi na /items (pełna
          nawigacja). onChange formalnie podpięty, ale kontrolki w disabled go nie wyemitują. */}
      <ListFilterBar
        criteria={criteria}
        onChange={(next) => {
          setCriteria(resetToFirstPage(next));
        }}
        error={error}
        onRetry={retry}
        disabled
      />

      {items.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
        >
          Ta sesja nie ma elementów.
        </div>
      ) : (
        items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            badges={{ acceptance: true, operational: true }}
            inFlight={inFlightIds.has(item.id)}
            onEdit={openEdit}
            onAccept={(it) => {
              void runRowAction(
                it,
                () => acceptItems([it.id]),
                "Zaakceptowano element.",
                "Nie udało się zaakceptować. Spróbuj ponownie.",
              );
            }}
            onReject={(it) => {
              void runRowAction(
                it,
                () => rejectItems([it.id]),
                "Odrzucono element.",
                "Nie udało się odrzucić. Spróbuj ponownie.",
              );
            }}
            onTrash={(it) => {
              void handleTrash(it);
            }}
            onRestore={(it) => {
              void runRowAction(
                it,
                () => restoreFromTrashItems([it.id]),
                "Przywrócono element.",
                "Nie udało się przywrócić. Spróbuj ponownie.",
              );
            }}
            onPreview={openPreview}
          />
        ))
      )}

      {/* Kontrolki stron — parytet z listą wpisów (wspólny klucz preferencji rozmiaru). Zmiana strony
          zachowuje kryteria wyświetlanej listy (settledCriteria); rozmiar resetuje na stronę 1. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageSizeSelect
          value={criteria.size}
          sizes={ITEM_PAGE_SIZES}
          ariaLabel="Liczba elementów na stronę"
          onChange={(size) => {
            writePageSizePref(ITEMS_LIST_PAGE_SIZE_KEY, ITEM_PAGE_SIZES, size);
            setCriteria(resetToFirstPage({ ...criteria, size }));
          }}
        />
        <Pagination
          page={page}
          pageCount={pageCount}
          ariaLabel="Paginacja wpisów sesji"
          onPage={(nextPage) => {
            setCriteria({ ...settledCriteria, page: nextPage });
          }}
        />
      </div>

      {dialogItem && (
        <EditItemDialog
          key={dialogItem.id}
          item={dialogItem}
          open
          readOnly={dialogReadOnly}
          onOpenChange={(open) => {
            if (!open) setDialogItem(null);
          }}
          onSaved={(updated) => {
            replaceRow(updated);
          }}
          onNotFound={() => {
            setDialogItem(null);
          }}
        />
      )}
    </div>
  );
}
