#!/usr/bin/env node
// Installs .git/hooks/pre-commit — lint:skills + the deterministic quality gate.
//
// Why versioned: .git/hooks is never committed, so a fresh clone (or pi's
// managed clone in ~/.pi/agent/git/... after "pi resets and cleans" it during
// package reconcile) silently loses the hook. npm runs this via "postinstall".
//
// Why --if-present: if the checkout predates the lint:skills script (e.g. the
// managed clone mid-reconcile at an older ref), the hook degrades to a no-op
// instead of blocking every commit — the exact failure hit on 2026-09-08.
import { execFileSync } from "node:child_process";
import { writeFileSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = execFileSync("git", ["rev-parse", "--git-path", "hooks/pre-commit"], { cwd: root, encoding: "utf8" }).trim();
const file = resolve(root, target);
const hook = '#!/bin/sh\nnpm run --silent --if-present lint:skills || { echo "lint:skills failed"; exit 1; }\nnpm run --silent --if-present gate || { echo "gate failed"; exit 1; }\n';
writeFileSync(file, hook);
chmodSync(file, 0o755);
console.log(`pre-commit hook installed: ${file}`);
