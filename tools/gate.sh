#!/bin/sh
# gate - deterministic staged-file quality gate (pre-commit; manual: npm run gate).
# Layers: awk parse + -safe static lint, bash -n, elisp-check, org-tasks smoke.
# Style judgment (decomposition, naming) is NOT here by design: hooks must be
# fast and deterministic; the canon lives in the kn awk-readability concept.
set -eu
cd "$(dirname "$0")/.."

staged=$(git diff --cached --name-only --diff-filter=ACMR)
[ -n "$staged" ] || exit 0

fail=0

# awk: parse/balance + -safe (forbids system(), print >, pipes, ENVIRON)
for f in $(printf '%s\n' "$staged" | grep '\.awk$' || true); do
  awk -f "$f" /dev/null </dev/null 2>/dev/null \
    || { echo "gate: FAIL awk parse: $f" >&2; fail=1; }
  awk -safe -f "$f" /dev/null </dev/null 2>/dev/null \
    || { echo "gate: FAIL awk -safe (system/redirect/pipe forbidden): $f" >&2; fail=1; }
done

# shell: syntax check
for f in $(printf '%s\n' "$staged" | grep '\.sh$' || true); do
  bash -n "$f" 2>/dev/null || { echo "gate: FAIL bash -n: $f" >&2; fail=1; }
done

# elisp: elisp-check (check-parens -> indent oracle -> byte-compile)
for f in $(printf '%s\n' "$staged" | grep '\.el$' || true); do
  if [ -x tools/elisp-check ]; then
    ./tools/elisp-check "$f" >/dev/null 2>&1 \
      || { echo "gate: FAIL elisp-check: $f" >&2; fail=1; }
  else
    echo "gate: skip elisp-check (tools/elisp-check not executable)" >&2
  fi
done

# org-tasks: full smoke suite whenever the skill changes
if printf '%s\n' "$staged" | grep -q '^skills/org-tasks/'; then
  log=$(mktemp /tmp/pi-etc-gate.XXXXXX)
  if bash skills/org-tasks/tests/smoke.sh >"$log" 2>&1; then
    grep ' checks, ' "$log" || true
    rm -f "$log"
  else
    grep '^FAIL' "$log" >&2 || true
    echo "gate: FAIL org-tasks smoke (full log: $log)" >&2
    fail=1
  fi
fi

[ "$fail" -eq 0 ] || { echo "gate: commit blocked" >&2; exit 1; }
exit 0
