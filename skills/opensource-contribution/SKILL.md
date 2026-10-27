---
name: opensource-contribution
description: "Writing upstream messages that maintainers actually read: bug reports, PR/MR descriptions, issue comments, mailing-list posts. Anti-AI-slop rules, evidence discipline, structure templates, scale-to-change and style-audit checklists, follow-up etiquette. Not for internal QA defect documentation or tracker automation; MusicBrainz contributions live in musicbrainz-contribute. Использовать, когда готовим сообщение в опенсорс: багрепорт, написать в апстрим, PR description, письмо мейнтейнеру или в рассылку, контрибьюция."
---

# opensource-contribution — upstream messages without the slop

You are writing to a busy maintainer who owes you nothing and reads at
skimming speed. Every sentence must earn its place. The contribution IS the
evidence, curated — what you filtered out is half the gift.

## Before writing (non-negotiable)

1. **Dedup**: search THEIR tracker + the web for the symptom. Cite near-misses
   in the report ("related but distinct: #NNN — why"). A duplicate report with
   good analysis is still welcome; a duplicate with none is slop.
2. **Read their rules**: CONTRIBUTING.md, issue templates, submission article
   (e.g. FreeBSD's "Writing Problem Reports"). Use THEIR fields and title
   style, not your own scheme.
3. **Calibrate to the room**: open 3 recent merged PRs / resolved issues.
   Copy their format, length, and register. A kernel-list mail differs from a
   GitHub issue; both differ from a GitLab MR to a small Wayland project.

## Scale to the change

- **One-line fix** → minimal report: repro, diff, why. Resist padding.
- **Significant change** → scope consult FIRST: comment on the existing issue
  / IRC / list with the design sketch BEFORE the big PR. The issue thread is
  your anchor; reference it everywhere.
- **Multi-part work** → offer a reviewable series ("core → feature → tests"),
  not a 13-commit blob. Ask maintainers which split they prefer.
- **Style-audit before PR**: check their code style rules and apply them to
  YOUR code — naming prefixes, allocator APIs, brace style, column limit,
  C standard, no-GNU-extensions. Rename your darlings to their conventions
  (an enum that misses their prefix is a review-speed bump).
- **A reproducible demo/test harness is the strongest evidence** a report can
  carry. If you built one, lead with it.

## Structure templates

**Bug report** — Title: `component: observed behavior` (one line, no drama).
Then: Environment (exact versions, hw) → Reproduction (deterministic commands,
not prose) → Observed (evidence excerpts) → Expected (spec/doc citation) →
Analysis (what you ruled out, with file:line refs) → Suggested direction.

**PR/MR** — Problem (why, link the issue) → Fix (what, minimal, why this
approach) → Testing (exact commands + observed results) → Notes for review
(risks, rejected alternatives).

**Mailing list** — one context paragraph, facts, then the ask. Short.
Subject line states the conclusion, not the journey.

## Anti-slop rules (the heart of this skill)

| Never | Instead |
|---|---|
| "Hi team!", "Hope you're doing well", "Thanks in advance!" | Start at the first fact |
| "delve", "leverage", "comprehensive", "seamless", "robust" | plain verbs: read, use, full, exact |
| "It's worth noting that", "Interestingly", "Notably" | delete the throat-clearing, keep the fact |
| "Moreover/Additionally" chains | cut, or renumber real lists |
| hedging everything ("might", "perhaps", "I believe") | commit to verified claims; mark the rest "unverified" |
| bullet-point-everything | prose for reasoning, lists for artifacts |
| restating the report in a closing summary | end at the last fact |
| apologetic opener about being new/possibly wrong | one honest scope note, if needed |
| "!" energy, emojis, bold-spam | flat declarative tone; bold for 2-3 real anchors max |
| pleasing tone: "happy to", "I'd love to", "буду рад", "feel free to", "let me know if you need" | end at the last fact — the work itself is the offer |
| pasted raw logs (500+ lines) | the 10 lines that matter + "full log attached" |

Absolute bans: invented line numbers, versions, quotes, benchmark numbers.
Every number reproducible by the reader from your repro steps. If an LLM
generated any part you could not verify, verify it or cut it — this is the
exact failure mode that got AI reports mass-banned (curl, 2025-2026).

## Evidence discipline

- file:line with repo paths, commit hashes, counter deltas
  ("+22 EXCHANGE_ID per 30s"), before/after behavior.
- Reproduction first, theory second, speculation labeled as such.
- Say what you EXCLUDED and how — negative results save maintainers hours.
- Attachments for anything over ~20 lines; name files descriptively.

## Tone

- First person singular for what you did; no "we" unless there is a we.
- Match their language (English for most trackers) and their register.
- Respect ≠ deference: plain, direct, no honorifics, no self-flagellation.
- No pleasing tone: zero eagerness signals, no offers of further service.
  The patch/report IS the gesture; servility reads as noise (or as a bot).
- Disagree with a maintainer by citing evidence, never by volume.

## Follow-up etiquette

- Maintainer replied: answer exactly what was asked, nothing else. No
  unasked-for status updates, no enthusiasm about the review.
- Silence is normal. Do not ping before ~2 weeks (or the project's own norm,
  if stated). One polite ping, never two in a row.
- Asked for changes/rebase: do them, reply tersely ("Rebased onto main;
  commit X dropped because Y").
- Abandoning the work: say so in the thread and close/label it yourself.

## Pre-submit checklist

- [ ] dedup done, near-misses cited
- [ ] their template/fields used, their title style
- [ ] scale right: minimal for small, consult-first for big, series offered
- [ ] style-audit applied if code is included
- [ ] repro is deterministic (someone else can run it)
- [ ] every number/quote reproducible, nothing invented
- [ ] no greetings, no filler, no AI-tell vocabulary
- [ ] prose where reasoning, lists where artifacts
- [ ] attachments named, oversized logs trimmed
- [ ] read it aloud once: would YOU triage this in 60 seconds?

## Sources

- Simon Tatham, "How to Report Bugs Effectively" (structure, "show me" ethos)
- Daniel Stenberg, "Death by a thousand slops" (2025), "The end of the curl
  bug-bounty" (2026) — what mass low-trust reports do to maintainers
- FreeBSD, "Writing FreeBSD Problem Reports" (docs.freebsd.org article)
