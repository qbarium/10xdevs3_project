// Wspólna karta wpisu (S-13 F3) — jedna implementacja zamiast trzech kopii inline w widokach głównych
// i czwartej w panelu S-10. Świadoma 4 stanów akceptacji, konfigurowana przez powierzchnię: badge'e,
// zaznaczanie, zestaw akcji (handlery opcjonalne). Akcja renderuje się TYLKO gdy podano handler ORAZ stan
// wpisu na nią pozwala (czysta funkcja `isActionAllowed` z `item-card.ts`). Układ akcji wynika ze STANU
// (nie z powierzchni): `pending` → kolumna Zatwierdź/Odrzuć/Edytuj po prawej (jak dotychczasowy widok
// akceptacji); `accepted` i kosz → akcje-duchy w wierszu tytułu (jak dotychczasowe Aktywne/Kosz).
// `data-item-id` + `tabIndex={-1}` zawsze — uchwyt focusu świeżego wpisu (S-07) niewidoczny bez fokusu.
//
// Szata „techniczna" (S-15 Faza 3): grzbień per typ, chip typu przez prymityw `Badge`, gęsty wiersz,
// meta (badge stanu + daty utworzenia/modyfikacji monospace). Kolory wyłącznie z tokenów (oba motywy) —
// zero zaszytych bieli/fioletów. Nienaruszalne uchwyty testów: `<article data-item-id>`, tytuł `<h3>`,
// checkbox `aria-label="Zaznacz: {title}"`, przycisk „Zatwierdź".

import type { ReactNode } from "react";

import { isActionAllowed } from "@/components/items/item-card";
import OperationalStatusBadge from "@/components/items/OperationalStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { acceptanceOriginLabel, acceptanceStatusLabel, itemTypeLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Item, ItemType } from "@/types";

/** Rozmiar checkboxa listy dopasowany do gęstego wiersza; kolory (zaznaczenie = `--primary`) z domyślnego
    prymitywu shadcn (tokeny, oba motywy) — bez nadpisań. Współdzielony z nagłówkami „Zaznacz wszystkie". */
export const ITEM_CHECKBOX_CLASS = "size-[18px]";

/** Grzbień per typ — kolory linii z tokenów Fazy 1 (`--*-line`, oba motywy). */
const SPINE_CLASS: Record<ItemType, string> = {
  task: "bg-task-line",
  note: "bg-note-line",
  idea: "bg-idea-line",
  decision: "bg-decision-line",
  other: "bg-other-line",
};

// Krótka data PL (dzień + skrót miesiąca) liczona deterministycznie w UTC — identyczna na SSR (workerd)
// i kliencie, więc bez rozjazdu hydracji i niezależna od danych ICU w środowisku.
const PL_MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${PL_MONTHS[d.getUTCMonth()]}`;
}

/** Przycisk-duch akcji inline (Edytuj / Do kosza / Podgląd / Przywróć) — token ghost, wyciszony w spoczynku. */
function GhostAction({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-foreground"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

interface Props {
  item: Item;
  /** Które badge'e (poza zawsze obecnym chipem typu) renderować — decyzja powierzchni. */
  badges: { acceptance?: boolean; operational?: boolean; origin?: boolean };
  /** Zaznaczanie (akcje zbiorcze widoków głównych). Tryb sesji nie podaje — checkbox znika. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Wpis w locie (mutacja trwa): wygaszenie `opacity-50` + blokada interakcji. */
  inFlight?: boolean;
  /** Blokada akcji MUTUJĄCYCH (akceptuj/odrzuć/kosz/przywróć) na czas innej mutacji; edycja/podgląd aktywne. */
  actionsDisabled?: boolean;
  onEdit?: (item: Item) => void;
  onAccept?: (item: Item) => void;
  onReject?: (item: Item) => void;
  onTrash?: (item: Item) => void;
  onRestore?: (item: Item) => void;
  onPreview?: (item: Item) => void;
}

export default function ItemCard({
  item,
  badges,
  selectable = false,
  selected = false,
  onToggleSelect,
  inFlight = false,
  actionsDisabled = false,
  onEdit,
  onAccept,
  onReject,
  onTrash,
  onRestore,
  onPreview,
}: Props) {
  const status = item.acceptance_status;
  // Akcja widoczna = handler podany ORAZ stan na nią pozwala (tabela w item-card.ts).
  const canEdit = onEdit != null && isActionAllowed(status, "edit");
  const canAccept = onAccept != null && isActionAllowed(status, "accept");
  const canReject = onReject != null && isActionAllowed(status, "reject");
  const canTrash = onTrash != null && isActionAllowed(status, "trash");
  const canRestore = onRestore != null && isActionAllowed(status, "restore");
  const canPreview = onPreview != null && isActionAllowed(status, "preview");

  // Kolumna akcji po prawej — wyłącznie stan `pending` (Zatwierdź/Odrzuć/Edytuj, jak dotychczasowy widok).
  const pendingActions = canAccept || canReject || (status === "pending" && canEdit);
  // Akcje-duchy w wierszu tytułu — stany `accepted` (Edytuj/Do kosza) i koszowe (Podgląd/Przywróć).
  const inlineActions = (status !== "pending" && canEdit) || canTrash || canPreview || canRestore;

  const op = item.operational_status;
  const created = shortDate(item.created_at);
  const modified = shortDate(item.updated_at);
  // Ukryj „zm." gdy pokrywa się z datą utworzenia (świeży wpis / edycja tego samego dnia) — uniknięcie szumu.
  const showModified = modified !== "" && modified !== created;

  // Ton tytułu wg stanu operacyjnego: „zrealizowane" przygaszony, „anulowane" przekreślony (wzorzec makiety).
  const titleTone =
    op === "done"
      ? "text-muted-foreground"
      : op === "cancelled"
        ? "text-muted-foreground line-through"
        : "text-foreground";

  return (
    <article
      data-item-id={item.id}
      tabIndex={-1}
      className={cn(
        "bg-card border-border flex items-stretch overflow-hidden rounded-[4px] border transition-colors",
        "hover:border-muted-foreground/25 focus:ring-ring focus:ring-2 focus:outline-none focus:ring-inset",
        inFlight && "pointer-events-none opacity-50",
      )}
    >
      {/* Grzbień per typ */}
      <div className={cn("w-[3px] shrink-0", SPINE_CLASS[item.type])} aria-hidden="true" />

      {selectable && (
        <div className="flex items-center pl-3.5">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            aria-label={`Zaznacz: ${item.title}`}
            className={ITEM_CHECKBOX_CLASS}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Badge variant={item.type}>{itemTypeLabel(item.type)}</Badge>
          <h3 className={cn("min-w-0 flex-1 truncate text-[14.5px] font-semibold", titleTone)}>{item.title}</h3>

          {inlineActions && (
            <div className="flex shrink-0 items-center gap-1">
              {status !== "pending" && canEdit && (
                <GhostAction
                  onClick={() => {
                    onEdit(item);
                  }}
                >
                  Edytuj
                </GhostAction>
              )}
              {canTrash && (
                <GhostAction
                  disabled={actionsDisabled}
                  onClick={() => {
                    onTrash(item);
                  }}
                >
                  Do kosza
                </GhostAction>
              )}
              {canPreview && (
                <GhostAction
                  onClick={() => {
                    onPreview(item);
                  }}
                >
                  Podgląd
                </GhostAction>
              )}
              {canRestore && (
                <GhostAction
                  disabled={actionsDisabled}
                  onClick={() => {
                    onRestore(item);
                  }}
                >
                  Przywróć
                </GhostAction>
              )}
            </div>
          )}
        </div>

        {item.description && <p className="text-muted-foreground line-clamp-2 text-[13px]">{item.description}</p>}

        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
          {badges.operational && op && <OperationalStatusBadge item={item} />}
          {badges.acceptance && <Badge variant="outline">{acceptanceStatusLabel(status)}</Badge>}
          {badges.origin && (status === "rejected" || status === "deleted") && (
            <Badge variant="outline">{acceptanceOriginLabel(status)}</Badge>
          )}
          <span className="font-mono">utw. {created}</span>
          {showModified && (
            <>
              <span className="opacity-50" aria-hidden="true">
                ·
              </span>
              <span className="font-mono">zm. {modified}</span>
            </>
          )}
        </div>
      </div>

      {pendingActions && (
        <div className="flex shrink-0 items-center gap-1 pr-3">
          {canAccept && (
            <Button
              variant="default"
              size="sm"
              disabled={actionsDisabled}
              onClick={() => {
                onAccept(item);
              }}
            >
              Zatwierdź
            </Button>
          )}
          {canReject && (
            <Button
              variant="outline"
              size="sm"
              disabled={actionsDisabled}
              onClick={() => {
                onReject(item);
              }}
            >
              Odrzuć
            </Button>
          )}
          {status === "pending" && canEdit && (
            <GhostAction
              onClick={() => {
                onEdit(item);
              }}
            >
              Edytuj
            </GhostAction>
          )}
        </div>
      )}
    </article>
  );
}
