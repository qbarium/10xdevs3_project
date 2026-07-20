// TYMCZASOWA SONDA BRAMKI TYPÓW — kryterium 1.4 planu testing-ci-gates-load-observation.
// Celowa niezgodność typów (TS2322): string przypisany do number. Eksport, by nie wywalił
// eslint no-unused-vars przed krokiem `tsc`. Ten plik żyje TYLKO na gałęzi-sondzie i NIE jest
// mergowany — PR sondy zamykamy po potwierdzeniu, że CI czerwieni się na kroku `tsc --noEmit`.
export const typecheckProbe: number = "to nie jest liczba";
