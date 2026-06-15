# pi-etc — монорепа расширений pi

По образцу [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff).
Один репозиторий → один npm-пакет → селективное включение расширений через конфиг.

## Структура

```
pi-etc/
├── extensions/        # .ts расширения (одно на файл)
├── skills/            # SKILL.md в поддиректориях
├── themes/            # JSON-темы (если будут)
├── tools/             # Общие утилиты (если нужны)
├── package.json       # pi-манифест с "pi" полем
├── tsconfig.json      # Общий конфиг TypeScript
└── TODO.md
```

## Миграция (этот этап) ✅

- [x] **pi-lint-check-extension** → `extensions/lint-check.ts` (index.ts + lint-check-core.ts слиты в один файл)
- [x] **pi-qwen** → `extensions/qwen/index.ts` + system-prompt.ts, edit-qwen.ts, tool-call-extractor.ts
- [x] **pi-way-skill** → `extensions/pi-way.ts` + `skills/pi-way/SKILL.md`
- [x] **pi-session** → `skills/pi-session/SKILL.md` + `tools/pi-session.ts`
- [x] **pi-skill-deepthink** → `skills/deepthink/SKILL.md` + `bin/tot-*`
- [x] **skill-layout-check** → `skills/layout-check/SKILL.md` + `skills/layout-check/scripts/layoutProbe.mjs`

## Финальная структура

```
pi-e4779/
├── extensions/
│   ├── lint-check.ts          # pi-lint-check (слитый)
│   ├── pi-way.ts              # pi-way-skill (инжектор принципов)
│   └── qwen/
│       ├── index.ts           # pi-qwen (entry point)
│       ├── system-prompt.ts   # Qwen Code системный промпт
│       ├── edit-qwen.ts       # Кастомный edit-инструмент
│       ├── tool-call-extractor.ts  # Парсер XML из thinking
│       └── diff.d.ts          # Типы для библиотеки diff
├── skills/
│   ├── pi-way/SKILL.md        # pi-way философия
│   ├── pi-session/SKILL.md    # Парсинг сессий
│   ├── deepthink/SKILL.md     # Tree-of-Thoughts
│   └── layout-check/
│       ├── SKILL.md           # CSS layout verification
│       └── scripts/layoutProbe.mjs
├── tools/
│   └── pi-session.ts          # CLI тулза для pi-session
├── bin/
│   ├── tot-add                # deepthink: добавить ветку
│   ├── tot-status             # deepthink: статус веток
│   └── tot-tree               # deepthink: рендер дерева
├── themes/                    # (пусто, для будущих тем)
├── package.json
├── TODO.md
└── tsconfig.json (нужно добавить)
```

## Отложено

- pi-mcporter (слишком тяжёлый, много файлов, под вопросом)
- pi-subagent (сложный, требует отдельного рассмотрения)
- pi-agent-rouble-footer (маленький, можно добавить потом)
- pi-gigachat-provider (специфичный провайдер)
