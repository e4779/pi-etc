#!/usr/bin/env bash
# smoke - self-contained fixture matrix for the org-tasks agenda CLI.
# usage: tests/smoke.sh    (builds its own fixture repo in a temp dir)
set -uo pipefail
# hermetic fixtures: under a git hook, GIT_INDEX_FILE/GIT_DIR point at the OUTER
# repo being committed - fixture repos must not inherit them (verified: suite
# breaks under a pre-commit hook without this)
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENDA="$HERE/../scripts/agenda"
export AGENDA_ROOTS_FILE=/dev/null   # hermetic: /dev/null is never -f, machine config cannot leak in
FIX="$(mktemp -d /tmp/org-smoke.XXXXXX)"
FIX2=""
trap 'rm -rf "$FIX" "$FIX2"' EXIT
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


# --- multi-root: AGENDA_ROOTS / -R cross-repo views ---
FIX2="$(mktemp -d /tmp/org-smoke2.XXXXXX)"
cat > "$FIX2/driver.org" <<'EOF'
#+TODO: TODO NEXT WAITING SOMEDAY | DONE CANCELLED
* NEXT Submit driver upstream
  :PROPERTIES:
  :BLOCKER: id:pump-driver-2026
  :END:
* SOMEDAY S3 resume reinit
EOF
cd "$FIX2" && git init -q && git add -A && git -c user.email=a@b -c user.name=t commit -qm fixtures2
xrun() { AGENDA_ROOTS="$FIX:$FIX2" timeout 30 "$AGENDA" "$@" 2>/dev/null; }

out=$(xrun todos)
if contains 'Submit driver upstream' "$out" && contains 'Написать драйвер помпы' "$out"; then ok 'roots: todos spans both repos'; else bad 'roots: todos missing a repo'; fi
out=$(xrun blocked)
if contains 'Submit driver upstream' "$out" && contains 'pump-driver-2026' "$out"; then ok 'roots: cross-repo blocker resolved against other repo'; else bad 'roots: cross-repo blocker lost'; fi
out=$(xrun graph)
if echo "$out" | grep -q 'unresolved id:pump-driver-2026'; then bad 'roots: graph dashed unresolved for known cross-repo id'; else ok 'roots: graph solid cross-repo edge'; fi
out=$(xrun ready)
if ! contains 'Submit driver upstream' "$out" && contains 'Рестарт bcachefsbox' "$out"; then ok 'roots: ready filters by cross-repo blocker'; else bad 'roots: ready wrong in multi-root'; fi
CFG2="$FIX2/roots.cfg"; printf '%s\n\n# comment\n%s\n' "$FIX" "$FIX2" > "$CFG2"
out=$(AGENDA_ROOTS_FILE="$CFG2" timeout 30 "$AGENDA" -R todos 2>/dev/null)
if contains 'Submit driver upstream' "$out" && contains 'Прогнать тесты на стенде' "$out"; then ok 'roots: -R reads config (comments/blanks skipped)'; else bad 'roots: -R config failed'; fi
out=$(xrun id notes.org "Ответ от upstream"); ec=$?
if [ "$ec" -eq 0 ]; then ok 'roots: id resolves relative file across roots'; else bad "roots: id relative resolution failed (exit=$ec)"; fi

# --- roots v3: config default, plain-dir roots, dedupe, roots management ---
out=$(AGENDA_ROOTS_FILE="$CFG2" timeout 30 "$AGENDA" todos 2>/dev/null)
if contains 'Submit driver upstream' "$out" && contains 'Написать драйвер помпы' "$out"; then ok 'roots: config is the default (no -R/env)'; else bad 'roots: default multi-root failed'; fi
out=$(AGENDA_ROOT="$FIX" timeout 30 "$AGENDA" todos 2>/dev/null)
if contains 'Написать драйвер помпы' "$out" && ! contains 'Submit driver upstream' "$out"; then ok 'roots: AGENDA_ROOT pins one repo'; else bad 'roots: AGENDA_ROOT override broken'; fi

FIX3="$(mktemp -d /tmp/org-smoke3.XXXXXX)"
cat > "$FIX3/plain.org" <<'EOF'
#+TODO: TODO NEXT WAITING SOMEDAY | DONE CANCELLED
* TODO Plain dir without git
#+begin_src org
* TODO fenced out
#+end_src
EOF
mkdir -p "$FIX3/.hidden" && printf '* TODO hidden tree\n' > "$FIX3/.hidden/h.org"
out=$(AGENDA_ROOTS="$FIX3" timeout 30 "$AGENDA" todos 2>/dev/null)
if contains 'Plain dir without git' "$out" && ! contains 'hidden tree' "$out"; then ok 'roots: plain dir root scanned, hidden pruned'; else bad 'roots: plain dir root failed'; fi

out=$(AGENDA_ROOTS="$FIX:$FIX" timeout 30 "$AGENDA" list TODO 2>/dev/null)
n=$(printf '%s\n' "$out" | grep -c 'Написать драйвер')
if [ "$n" -eq 1 ]; then ok 'roots: duplicate roots deduped'; else bad "roots: dup roots listed task $n times"; fi

RCFG="$FIX/roots.cfg"
out=$(AGENDA_ROOTS_FILE="$RCFG" timeout 30 "$AGENDA" roots list 2>/dev/null)
if contains '# no roots config' "$out"; then ok 'roots: list on missing config'; else bad 'roots: list missing-config failed'; fi
AGENDA_ROOTS_FILE="$RCFG" timeout 30 "$AGENDA" roots add "$FIX2" >/dev/null 2>&1 && ok 'roots: add registers dir' || bad 'roots: add failed'
out=$(AGENDA_ROOTS_FILE="$RCFG" timeout 30 "$AGENDA" roots add "$FIX2" 2>/dev/null)
if contains 'already registered' "$out"; then ok 'roots: add is idempotent'; else bad 'roots: add dup not detected'; fi
AGENDA_ROOTS_FILE="$RCFG" timeout 30 "$AGENDA" roots add /nonexistent-dir-xyz >/dev/null 2>&1; ec=$?
if [ "$ec" -eq 2 ]; then ok 'roots: add rejects missing dir'; else bad "roots: add missing-dir exit=$ec"; fi
out=$(AGENDA_ROOTS_FILE="$RCFG" timeout 30 "$AGENDA" roots list 2>/dev/null)
if contains "$FIX2  [git]" "$out"; then ok 'roots: list shows annotated entry'; else bad 'roots: list lost entry'; fi
AGENDA_ROOTS_FILE="$RCFG" timeout 30 "$AGENDA" roots rm "$FIX2" >/dev/null 2>&1 && ok 'roots: rm removes' || bad 'roots: rm failed'
AGENDA_ROOTS_FILE="$RCFG" timeout 30 "$AGENDA" roots rm "$FIX2" >/dev/null 2>&1; ec=$?
if [ "$ec" -eq 4 ]; then ok 'roots: rm unknown exits 4'; else bad "roots: rm unknown exit=$ec"; fi
out=$(AGENDA_ROOTS_FILE="$RCFG" timeout 30 "$AGENDA" roots scan "$FIX" 2>/dev/null)
if contains "$FIX" "$out"; then ok 'roots: scan finds candidates'; else bad 'roots: scan empty'; fi
printf '\n%d checks, %d failures\n' "$RUNS" "$FAILS"
[ "$FAILS" -eq 0 ]
