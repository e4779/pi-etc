---
status: pending
blocked-by: [orchestration-nuggets-to-system-agents.md]
---

# fabric-orchestration residue sweep

## Objective

After the nuggets distillation lands: sweep the remaining value of the
deleted fabric-orchestration skill so nothing else rots unnoticed.

## Checklist

- [ ] Non-blocking-call doctrine: port to riff when apps/riff exists
      (pi-durable has native async now — parked tools, signals,
      subagents as conversations; map the fabric pattern onto those)
- [ ] Cross-skill references: verify none still point at the deleted
      skill (sobesednik/pi-recall were cleaned at deletion time)
- [ ] If pi-fabric sessions ever need the doctrine again: it lives in
      git history and the pi-fabric repo's own docs
