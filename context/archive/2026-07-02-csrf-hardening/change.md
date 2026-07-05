---
id: csrf-hardening
title: Utwardzenie anty-CSRF mutujących endpointów (origin-check)
status: archived
created: 2026-07-02
updated: 2026-07-05
archived_at: 2026-07-05T13:07:56Z
---

# Utwardzenie anty-CSRF mutujących endpointów

## Problem

Aplikacja używa sesji Supabase opartej na ciasteczkach (`@supabase/ssr`), a wszystkie
mutacje idą przez endpointy `src/pages/api/**` ufające wyłącznie ciasteczku sesji. To
klasyczny model podatny na CSRF. Zadanie: utwardzić powierzchnię mutującą kontrolą
`Origin` (opcjonalnie tokenem).

## Ustalenie z badania (2026-07-02)

Powierzchnia jest już chroniona **niejawnie** przez zbieg trzech mechanizmów: domyślnego
`security.checkOrigin: true` w Astro 6.3.1, `SameSite=Lax` z domyślnych `@supabase/ssr`
oraz preflightu CORS dla `application/json`. Zmiana nie łata otwartej dziury — czyni
ochronę **jawną, odporną na regresję i dokłada warstwę aplikacyjną** (origin-check w
`middleware.ts` obejmujący też klasę JSON, której Astro nie sprawdza). Wariant tokenowy
świadomie odrzucony jako redundantny wobec origin-check (brak wspólnego wrappera `fetch`,
10 rozproszonych wywołań + 3 formularze poza `fetch`).

Plan: `plan.md` · Brief: `plan-brief.md`
