#!/bin/sh
# lint-skills-data.sh — permanent mechanical gates for skills/ (plan-v2 §11).
#
# Checks:
#   per-skill, for skills in STRICT_SKILLS:
#     - SKILL.md line budget (<= MAX_SKILL_LINES)
#     - description <= MAX_DESC_CHARS chars, WHEN-form: EN "Use when" +
#       "RU:" clause with Cyrillic, EN part <= 2 sentences
#     - every path token mentioned in SKILL.md body resolves on disk
#     - slugs mentioned in SKILL.md == ls references/handbook/dom (when dom/)
#   repo-wide:
#     - raw data counters ("N families/семей/доменов") banned in manuscripts
#     - every references/handbook/*.md opens with a GENERATED + as-of banner
#     - extinguish gate: references/wild-taxonomy.md may not coexist with
#       a generated handbook/ (§11)
#
# Scope note: strict gates cover the skills listed in STRICT_SKILLS until
# their texts are normalized; widen the variable, never weaken the check.
#
# Run:  sh scripts/lint-skills-data.sh [repo-root]
#       root arg exists for sandbox tests; CI path: npm run lint:skills
set -eu

ROOT=${1:-$(cd "$(dirname "$0")/.." && pwd)}
SKILLS="$ROOT/skills"
ATLAS=${ATLAS_ROOT:-"$HOME/projects/shell-atlas"}
STRICT_SKILLS=${STRICT_SKILLS:-"shell-taste"}
MAX_SKILL_LINES=100
MAX_DESC_CHARS=1024
# display->slug contract lives in the atlas emitter (bin/handbook); this list
# is the lint-side mirror of plan-v2 §2 and is covered by handbook-fixture.
SLUGS="output-logging errors-exit installation-setup network files-paths checks-validation system-administration privilege-users text-data terminal-ux process-control containers agents-ai-tooling uncategorized"

fails=0
fail() {
	printf 'lint-skills: FAIL %s\n' "$*"
	fails=$((fails + 1))
}

# exact UTF-8 char length on stdin, locale-independent:
# chars = bytes - continuation bytes (LC_ALL=C makes length() count bytes)
utf8len() {
	LC_ALL=C awk '
		{ b = length($0); k = 0
		  for (i = 1; i <= b; i++) {
			c = substr($0, i, 1)
			if (c >= "\200" && c <= "\277") k++
		  }
		  n += b - k
		}
		END { print n + 0 }'
}

# description value from YAML frontmatter: single-line, quoted, or folded
# block scalar (>/|>-/|- variants); joined into one logical line on stdout
desc_of() {
	LC_ALL=C awk '
		/^---[[:space:]]*$/ {
			if (block) { got = 1; block = 0 }
			fm++
			next
		}
		fm == 1 && !got && /^description:/ {
			v = substr($0, 13)
			gsub(/^[[:space:]]+/, "", v)
			if (v ~ /^[>|][+-]?[[:space:]]*$/) { block = 1 }
			else {
				# NB: awk gsub has no \1 backreferences — strip quotes pairwise
				if (v ~ /^".*"$/) {
					gsub(/^"/, "", v)
					gsub(/"$/, "", v)
				}
				got = 1
			}
			next
		}
		block {
			if ($0 ~ /^[^[:space:]]/) { got = 1 }
			else {
				t = $0
				gsub(/^[[:space:]]+/, "", t)
				v = v (v == "" ? "" : " ") t
			}
			next
		}
		END { if (got) print v }'
}

# WHEN-form gate for one SKILL.md (§3.1/§11): length, EN marker, RU clause,
# <=2 sentences in the EN base (RU clause is a clause, not a sentence)
check_desc() {
	s=$1
	f=$2
	d=$(desc_of <"$f")
	[ -n "$d" ] || {
		fail "$s: empty or missing frontmatter description"
		return
	}
	n=$(printf '%s\n' "$d" | utf8len)
	[ "$n" -le "$MAX_DESC_CHARS" ] ||
		fail "$s: description $n chars > $MAX_DESC_CHARS"
	case $d in
	*Use\ when*) ;;
	*) fail "$s: description lacks EN 'Use when' marker" ;;
	esac
	case $d in
	*RU:*) ;;
	*) fail "$s: description lacks 'RU:' clause marker" ;;
	esac
	printf '%s\n' "$d" |
		LC_ALL=C grep -q "$(printf '\320')\|$(printf '\321')" ||
		fail "$s: description lacks Cyrillic (RU clause)"
	en=${d%%RU:*}
	sent=$(printf '%s\n' "$en" | LC_ALL=C awk '
		{ s = s $0 " " }
		END {
			gsub(/e\.g\./, "eg", s)
			gsub(/i\.e\./, "ie", s)
			gsub(/etc\./, "etc", s)
			gsub(/vs\./, "vs", s)
			print gsub(/[.!?]( |$)/, ".", s) + 0
		}')
	[ "$sent" -le 2 ] ||
		fail "$s: EN description has $sent sentences > 2"
}

# every path-like token in SKILL.md body must resolve on disk.
# candidates: ~/..., known prefixes (references|work|scripts|skills)/...,
# or any slashed token whose last segment carries an extension (work/cards.toon).
# relative tokens are tried against: skill dir, repo root, atlas root.
# system-absolute prose paths (etc/..., bin/..., usr/...) are machine-dependent
# and are NOT gate targets — they are dropped after extraction.
check_paths() {
	s=$1
	f=$2
	skilldir=$3
	cands=$(LC_ALL=C awk '/^---[[:space:]]*$/{fm++; next} fm >= 2' "$f" |
		sed -E 's#https?://[^[:space:])]+##g' |
		LC_ALL=C grep -oE '(~/[A-Za-z0-9._/-]+|references/[A-Za-z0-9._/-]+|work/[A-Za-z0-9._/-]+|scripts/[A-Za-z0-9._/-]+|skills/[A-Za-z0-9._/-]+|[A-Za-z0-9_-]+(/[A-Za-z0-9._-]+)+\.[A-Za-z0-9]+)' |
		sed -E 's/[.,;:)]+$//' |
		sort -u) || cands=''
	for tok in $cands; do
		case $tok in
		etc/*|usr/*|bin/*|sbin/*|var/*|tmp/*|opt/*|home/*|mnt/*|boot/*|dev/*|lib/*)
			continue ;;
		esac
		case $tok in
		~*) p=${tok#'~/'}
			p="$HOME/$p"
			[ -e "$p" ] || fail "$s: path '$tok' does not exist" ;;
		/*) [ -e "$tok" ] || fail "$s: path '$tok' does not exist" ;;
		*)
			found=0
			for base in "$skilldir" "$ROOT" "$ATLAS"; do
				[ -e "$base/$tok" ] && {
					found=1
					break
				}
			done
			[ "$found" -eq 1 ] || fail "$s: path '$tok' does not exist (skilldir|repo|atlas)"
			;;
		esac
	done
}

# strict per-skill gates
for s in $STRICT_SKILLS; do
	if [ -f "$SKILLS/$s/SKILL.md" ]; then sdir="$SKILLS/$s"
	elif [ -f "packages/skills/$s/SKILL.md" ]; then sdir="packages/skills/$s"
	else sdir="$SKILLS/$s"; fi
	f="$sdir/SKILL.md"
	[ -f "$f" ] || {
		fail "$s: SKILL.md missing"
		continue
	}
	lines=$(wc -l <"$f" | tr -d ' ')
	[ "$lines" -le "$MAX_SKILL_LINES" ] ||
		fail "$s: SKILL.md $lines lines > $MAX_SKILL_LINES"
	check_desc "$s" "$f"
	check_paths "$s" "$f" "$sdir"
	# slug coverage: SKILL-mentioned slugs must equal emitted dom pages
	domdir="$sdir/references/handbook/dom"
	if [ -d "$domdir" ]; then
		# generated names are recipe-controlled (<NN>-<slug>.md, no spaces)
		dom=$(find "$domdir" -maxdepth 1 -name '*.md' -exec basename {} .md \; |
			sed -E 's/^[0-9]+-//' | sort)
		men=''
		for slug in $SLUGS; do
			grep -q -- "$slug" "$f" && men="$men $slug"
		done
		# intentional word split of the space-separated slug vocabulary
		men=$(printf '%s\n' "$men" | tr ' ' '\n' | sed '/^$/d' | sort)
		flat=$(printf '%s' "$men" | tr '\n' ' ')
		domflat=$(printf '%s' "$dom" | tr '\n' ' ')
		[ "$men" = "$dom" ] ||
			fail "$s: slug set mismatch SKILL=[$flat] dom=[$domflat]"
	fi
done

# repo-wide: raw data counters banned in manuscripts (drift class §11).
# Scope = SKILL.md only: reference data files legitimately carry counts.
for f in "$SKILLS"/*/SKILL.md; do
	[ -f "$f" ] || continue
	found=$(LC_ALL=C grep -nE '[0-9]{2,3} (families|семей|доменов|домена)' "$f" 2>/dev/null |
		LC_ALL=C grep -v 'as-of') || found=''
	[ -z "$found" ] || {
		printf '%s\n' "$found"
		fail "raw data counters in ${f#"$ROOT"/}"
	}
done

# repo-wide: generated layer must open with GENERATED + as-of banner
# generated names are recipe-controlled (no spaces): find-loop is safe here
# shellcheck disable=SC2044
for f in $(find "$SKILLS" -path '*/references/handbook/*' -name '*.md' -type f 2>/dev/null); do
	head -n 1 "$f" | grep -q '^<!-- GENERATED.*as-of:' ||
		fail "${f#"$ROOT"/}: missing GENERATED/as-of banner (line 1)"
done

# extinguish gate: wild-taxonomy.md must not coexist with generated handbook
if [ -e "$SKILLS/shell-taste/references/wild-taxonomy.md" ]; then
	if [ -d "$SKILLS/shell-taste/references/handbook" ]; then
		fail 'extinguish gate: wild-taxonomy.md coexists with generated references/handbook/ (§11)'
	fi
fi

if [ "$fails" -eq 0 ]; then
	echo "lint-skills: OK (strict: $STRICT_SKILLS)"
	exit 0
fi
echo "lint-skills: $fails violation(s)"
exit 1
