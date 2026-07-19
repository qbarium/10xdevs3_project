#!/usr/bin/env bash
# PostToolUse (Write|Edit): lintuje TYLKO edytowany plik.
# `eslint .` = >3 min w tym repo (OneDrive + reguly type-checked); pojedynczy plik ~14 s.
# Blad -> raport na STDERR + exit 2 (PostToolUse pokazuje Claude stderr tylko przy exit 2).
set -uo pipefail

# Sciezka edytowanego pliku ze stdin (JSON). Brak jq -> parsujemy node'em.
file="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write((JSON.parse(s).tool_input?.file_path)||"")}catch{}})')"
[ -n "$file" ] || exit 0
case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.astro) ;;
  *) exit 0 ;; # plik nie-lintowalny -> cisza
esac

out="$(npx --no-install eslint "$file" 2>&1)"
code=$?
if [ "$code" -ne 0 ]; then
  printf '%s\n' "$out" >&2
  echo "ESLint failed on ${file}. Fix the problems above before continuing." >&2
  exit 2
fi
exit 0
