import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import type { Theme } from "@/lib/theme";

// Adaptacja shadcn `sonner` dla Astro: BEZ `next-themes` (projekt nie jest Next.js). Motyw śledzony z klasy
// `.dark` na `<html>` (to samo źródło co reszta UI) przez MutationObserver — toast reaguje na przełącznik
// motywu na żywo. Osadzany w drzewie React islandu (PendingItemsView) jako system feedbacku akcji.
function Toaster(props: ToasterProps) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const read = () => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
