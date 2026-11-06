#!/usr/bin/env bash
# smoke - self-contained fixture matrix for the org-tasks agenda CLI.
# usage: tests/smoke.sh    (builds its own fixture repo in a temp dir)
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENDA="$HERE/../scripts/agenda"
FIX="$(mktemp -d /tmp/org-smoke.XXXXXX)"
trap 'rm -rf "$FIX"' EXIT
RUNS=0; FAILS=0
ok()  { RUNS=$((RUNS+1)); printf 'ok   %s\n' "$1"; }
bad() { FAILS=$((FAILS+1)); printf 'FAIL %s\n' "$1"; }
contains() { echo "$2" | grep -qF -- "$1"; }

# --- fixture ---
cat > "$FIX/pump.org" <<'EOF'
#+TODO: TODO NEXT WAITING SOMEDAY | DONE CANCELLED
* TODO Написать драйвер помпы
  DEADLINE: <2026-11-12 Thu>
  :PROPERTIES:
  :ID: pump-driver-2026
  :END:
* DONE Настроить стенд
  :PROPERTIES:
  :ID: stand-2026
  :END:
* NEXT Прогнать тесты на стенде
  :PROPERTIES:
  :BLOCKER: id:stand-2026
  :END:
EOF
cat > "$FIX/runbook.org" <<'EOF'
#+TODO: TODO NEXT WAITING SOMEDAY | DONE CANCELLED
* Runbook: NFS после бута
** TODO Разобрать BADSTATEID поток
   :PROPERTIES:
   :BLOCKER: id:pump-driver-2026
   :END:
   Зависит от [[id:pump-driver-2026][драйвера помпы]].
** NEXT Рестарт bcachefsbox по регламенту
EOF
cat > "$FIX/notes.org" <<'EOF'
* Sketch area
** TODO Migrate backup scripts
   Text first, drawer later.
   :PROPERTIES:
   :BLOCKER: id:missing-id-404
   :END:
#+begin_src org
* TODO фейковый хединг в блоке
#+end_src
* todo lowercase visible hazard
* SKILL FEEDBACK секция документа
* WAITING Ответ от upstream
EOF
cat > "$FIX/задачи.org" <<'EOF'
#+TODO: TODO NEXT WAITING SOMEDAY | DONE CANCELLED
* TODO Кириллический путь: файл виден
EOF
cd "$FIX" && git init -q && git add -A && git -c user.email=a@b -c user.name=t commit -qm fixtures

run() { AGENDA_ROOT="$FIX" timeout 30 "$AGENDA" "$@" 2>/dev/null; }

# --- gate: awk parse + static safety (research Tier A) ---
VIEWS="$HERE/../scripts/views.awk"
if awk -f "$VIEWS" /dev/null </dev/null 2>/dev/null; then ok 'gate: views.awk parses'; else bad 'gate: views.awk parse error'; fi
if awk -safe -f "$VIEWS" /dev/null </dev/null 2>/dev/null; then ok 'gate: -safe static lint passes'; else bad 'gate: -safe rejected views.awk'; fi

# --- matrix ---
out=$(run ready)
if contains 'Прогнать тесты на стенде' "$out" && contains 'Рестарт bcachefsbox' "$out"; then ok 'ready: resolved blocker leaves ready'; else bad 'ready: expected both NEXT tasks'; fi
if ! contains 'Разобрать BADSTATEID' "$out"; then ok 'ready: blocked task excluded'; else bad 'ready: blocked task leaked'; fi

out=$(run blocked)
if contains 'Разобрать BADSTATEID' "$out" && contains 'pump-driver-2026' "$out"; then ok 'blocked: cross-ref blocker listed'; else bad 'blocked: missing resolved-target blocker'; fi
if contains 'Migrate backup' "$out" && contains 'id:missing-id-404' "$out"; then ok 'blocked: dangling blocker listed (C2 semantics)'; else bad 'blocked: dangling blocker not treated as blocking'; fi

out=$(run list)
if contains 'Кириллический путь: файл виден' "$out"; then ok 'list: cyrillic path visible'; else bad 'list: cyrillic path lost'; fi

out=$(run todos)
if contains 'Кириллический путь' "$out"; then ok 'todos: native org-todo-list works'; else bad 'todos: native view broken'; fi

out=$(run agenda)
if contains 'In' "$out" && contains 'Написать драйвер помпы' "$out"; then ok 'agenda: native org-agenda-list + deadline'; else bad 'agenda: native view broken'; fi

out=$(run graph)
if contains 'digraph tasks' "$out" && contains '->' "$out"; then ok 'graph: DOT with edges'; else bad 'graph: missing DOT/edges'; fi
if [ "$(printf '%s\n' "$out" | head -1)" = 'digraph tasks {' ]; then ok 'graph: valid DOT header first'; else bad 'graph: DOT header not first'; fi
if contains 'style=dashed' "$out"; then ok 'graph: dashed unresolved node'; else bad 'graph: no dashed unresolved node'; fi

out=$(run vocab)
if contains 'TODO NEXT WAITING SOMEDAY | DONE CANCELLED' "$out" && contains 'задачи.org' "$out"; then ok 'vocab: declarations listed'; else bad 'vocab: declarations missing'; fi

AGENDA_ROOT="$FIX" timeout 30 "$AGENDA" lint >/tmp/org-smoke-lint 2>/dev/null; ec=$?
wn=$(grep -c ':' /tmp/org-smoke-lint || true)
lc=$(grep -c 'undeclared keyword todo' /tmp/org-smoke-lint || true)
if [ "$ec" -eq 1 ] && grep -q 'undeclared keyword TODO' /tmp/org-smoke-lint && grep -q 'undeclared keyword WAITING' /tmp/org-smoke-lint && grep -q ':PROPERTIES: not directly after heading' /tmp/org-smoke-lint && grep -q 'no #+TODO: declaration' /tmp/org-smoke-lint && grep -q 'dangling blocker' /tmp/org-smoke-lint && [ "$lc" -ge 1 ] && ! grep -q 'undeclared keyword SKILL' /tmp/org-smoke-lint; then ok "lint: heuristic + 5 classes (exit 1, $wn lines)"; else bad "lint: expected warning classes (exit=$ec, lowercase-warns=$lc)"; fi

# --- cross-file state leak guard (regression: bcachefs false positives) ---
printf '#+TODO: TODO NEXT WAITING SOMEDAY | DONE CANCELLED\n* TODO Trailing entry with body\nsome body text\n' > "$FIX/x1.org"
printf '#+TODO: TODO NEXT WAITING SOMEDAY | DONE CANCELLED\n:PROPERTIES:\n:ID: filelevel-1\n:END:\n* DONE Fresh file entry\n' > "$FIX/x2.org"
out=$(awk -v mode=lint -f "$VIEWS" "$FIX/x1.org" "$FIX/x2.org" 2>&1); ec=$?
if [ "$ec" -eq 0 ] && [ -z "$out" ]; then ok 'lint: no cross-file state leak'; else bad "lint: cross-file leak (exit=$ec): $out"; fi

# --- id flow ---
out=$(AGENDA_ROOT="$FIX" timeout 30 "$AGENDA" id notes.org "фейковый хединг" 2>/dev/null); ec=$?
if [ "$ec" -eq 4 ]; then ok 'id: in-block pseudo-heading refused'; else bad "id: pseudo-heading not refused (exit=$ec)"; fi
out=$(AGENDA_ROOT="$FIX" timeout 30 "$AGENDA" id notes.org "Migrate backup" 2>/dev/null); ec=$?
if [ "$ec" -eq 0 ] && grep -q ':ID:' "$FIX/notes.org"; then ok 'id: real heading stamped'; else bad "id: real heading not stamped (exit=$ec)"; fi

printf '\n%d checks, %d failures\n' "$RUNS" "$FAILS"
[ "$FAILS" -eq 0 ]
