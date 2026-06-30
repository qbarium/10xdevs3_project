// Wybór liczby wpisów na stronę dziennika (S-11): motywowany Select z pulą `SESSION_PAGE_SIZES`. KONTROLOWANY
// — rodzic (wyspa) trzyma bieżący rozmiar w kryteriach; trwałość (localStorage) ogarnia rodzic przy zmianie.
// Wartości Radix Select są stringami, więc konwertujemy number ↔ string na brzegach.

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SESSION_PAGE_SIZES } from "@/lib/services/session-list-criteria";

interface Props {
  value: number;
  onChange: (size: number) => void;
}

export default function PageSizeSelect({ value, onChange }: Props) {
  return (
    <label className="flex items-center gap-1.5 text-sm whitespace-nowrap text-white/60">
      Na stronę
      <Select
        value={String(value)}
        onValueChange={(next) => {
          onChange(Number(next));
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label="Liczba wpisów na stronę"
          className="w-[76px] rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SESSION_PAGE_SIZES.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
