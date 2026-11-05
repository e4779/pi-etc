# playbook: deprecating TODO.md (one-time per repo)

1. Inventory: list entries of the legacy TODO.md (and TODO.org if any).
2. Route each entry:
   - still relevant -> move INTO the document where it belongs (runbook,
     spec, log) as a keyword heading; stamp :ID: only if referenced;
   - obsolete -> CANCELLED with a one-line reason, or drop entirely;
   - dreams -> SOMEDAY in the appropriate doc.
3. Delete the legacy file in the same commit. Two sources of truth = zero.
4. Add the org-tasks snippet to the repo AGENTS.md (see conventions.md).
5. Run agenda lint; fix what it flags; commit.

Never run migration "in parallel" with the old file - that forks the truth.
