// Wybór liczby wpisów na stronę (S-11, uogólnione w S-13 F2): motywowany Select z pulą `sizes` podaną przez
// rodzica. KONTROLOWANY — rodzic (wyspa) trzyma bieżący rozmiar w kryteriach; trwałość (localStorage) ogarnia
// rodzic przy zmianie (`writePageSizePref`). Wartości Radix Select są stringami, więc konwertujemy
// number ↔ string na brzegach. Wcześniej `import-sessions/PageSizeSelect.tsx` z pulą dziennika na sztywno.

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  value: number;
  onChange: (size: number) => void;
  sizes: readonly number[];
  ariaLabel: string;
}

export default function PageSizeSelect({ value, onChange, sizes, ariaLabel }: Props) {
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
          aria-label={ariaLabel}
          className="w-[76px] rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sizes.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
