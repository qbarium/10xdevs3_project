import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Chip typu w charakterze „technicznym" (WERSALIKI, ~10 px, ostre rogi ~3 px) — wg ui-design-system.md.
// Warianty per typ czytają tokeny kolorów z Fazy 1 (`--*-bg`/`--*-fg`, oba motywy). Radix `Slot`
// (asChild) jest już przypięty w `ssr.optimizeDeps.include` → brak nowej powierzchni dup-React.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-[3px] border border-transparent px-[7px] py-[3px] text-[10px] font-semibold uppercase leading-none tracking-[0.04em] [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        task: "bg-task-bg text-task-fg",
        note: "bg-note-bg text-note-fg",
        idea: "bg-idea-bg text-idea-fg",
        decision: "bg-decision-bg text-decision-fg",
        other: "bg-other-bg text-other-fg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
