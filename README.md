# pi-etc

Персональный набор расширений, скиллов и утилит для [pi coding agent](https://buildwithpi.ai) — `/etc` для pi.  
Всё в одном репозитории по образцу [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff).

## Установка

```bash
pi install git:git@gitverse.ru:e4779/pi-etc.git
```

Или локально (для разработки):

```bash
pi install ~/dev/pi-etc -l
```

## Что внутри

### Расширения (`extensions/`)

| Расширение | Файл | Описание |
|---|---|---|
| **lint-check** | `extensions/lint-check/index.ts` | Запускает линтеры через nano-staged после каждого хода агента |
| **qwen-flavor** | `extensions/qwen/index.ts` | Активирует Qwen Code системный промпт и edit-инструмент для Qwen-моделей |
| **co-author** | `extensions/co-author/index.ts` | Автоматически добавляет `Co-authored-by:` trailer к `git commit` по текущей модели. Маппинг model.id → identity в `~/.pi/agent/coauthors.json`, fallback — выводится из model.id |

### Скиллы (`skills/`)

| Скилл | Команда | Описание |
|---|---|---|
| **pi-session** | `/skill:pi-session` | Парсинг и инспекция JSONL-сессий pi агента (summary, grep, context, timeline) |
| **github** | `/skill:github` | GitHub через github MCP: поиск репо/кода/issue, PR, ревью, мердж |
| **mcporter** | `/skill:mcporter` | Обзор mcporter CLI: discovery, вызов и управление MCP-серверами из терминала |
| **layout-check** | `/skill:layout-check` | Верификация CSS-вёрстки через Chrome DevTools |
| **chrome-devtools** | `/skill:chrome-devtools` | Управление реальной вкладкой Chrome через chrome-devtools MCP (без раздувания контекста на 18k токенов) |
| **zai-mcp** | `/skill:zai-mcp` | Веб-поиск, страница→markdown, семантическое чтение GitHub-репо, OCR/анализ изображений и видео через 4 Z.AI MCP сервера |
| **mcpls** | `/skill:mcpls` | Семантическая навигация по коду через LSP (mcpls MCP→LSP мост): определения, ссылки, символы, диагностики, ренейм-рефакторинг |

### Утилиты (`tools/`, `bin/`)

| Инструмент | Назначение |
|---|---|
| `tools/pi-session.ts` | CLI для инспекции сессий: `npx tsx tools/pi-session.ts --summary` |
| `tools/install-hooks.mjs` | Ставит pre-commit хук (гейт `lint:skills`); запускается сам через `postinstall` при `npm install` |


## Селективное включение

Пакет устанавливается целиком, но в настройках агента можно выбрать, какие расширения активировать.  
Файл настроек: `~/.pi/agent/settings.json` → поле `packages`.

### Пример 1: всё включено

```json
{
  "packages": [
    "git:git@gitverse.ru:e4779/pi-etc.git"
  ]
}
```

Без фильтрации — pi загрузит все расширения из `extensions/**/*.ts` и все скиллы из `skills/`.

### Пример 2: только qwen

```json
{
  "packages": [
    {
      "source": "git:git@gitverse.ru:e4779/pi-etc.git",
      "extensions": [
        "extensions/qwen/index.ts"
      ]
    }
  ]
}
```

### Пример 3: только скиллы, без расширений

```json
{
  "packages": [
    {
      "source": "git:git@gitverse.ru:e4779/pi-etc.git",
      "extensions": []
    }
  ]
}
```

Расширения отключены, но скиллы всё равно доступны через `/skill:...`.

### Пример 4: конкретные скиллы

```json
{
  "packages": [
    {
      "source": "git:git@gitverse.ru:e4779/pi-etc.git",
      "skills": [
        "layout-check",
        "zai-mcp"
      ]
    }
  ]
}
```

### Пример 5: вместе с другими пакетами

```json
{
  "packages": [
    {
      "source": "git:git@gitverse.ru:e4779/pi-etc.git",
      "extensions": [
        "extensions/qwen/index.ts"
      ]
    },
    "npm:@tintinweb/pi-tasks",
    "git:github.com/e4779/pi-design-skill.git"
  ]
}
```

## Команды

После установки доступны команды:

| Команда | Расширение | Действие |
|---|---|---|
| `/qwen-flavor` | qwen | Вкл/выкл Qwen Code промпт и edit-инструмент |
| `/lint-check` | lint-check | Настройки линтера (вкл/выкл, игнор-лист, сброс) |

## Разработка

```bash
# Клонировать
git clone git@gitverse.ru:e4779/pi-etc.git
cd pi-etc

# Установить зависимости
npm install

# Проверить типы
npx tsc --noEmit

# Проверить скиллы (frontmatter SKILL.md по спеке Agent Skills)
npm run lint:skills

# Тестировать локально (без установки)
pi -e ~/dev/pi-etc/extensions/qwen/index.ts
```

## Структура

```
pi-etc/
├── extensions/           # Расширения (одно .ts на расширение или вложенная директория)
│   ├── co-author/
│   ├── lib/                   # общие хелперы (fabric-detect.ts и др.)
│   ├── lint-check/
│   │   ├── index.ts
│   │   └── README.md
│   └── qwen/
│       ├── index.ts
│       ├── system-prompt.ts
│       ├── edit-qwen.ts
│       └── tool-call-extractor.ts
├── skills/               # Скиллы (SKILL.md в поддиректориях)
│   ├── pi-session/SKILL.md
│   ├── github/SKILL.md
│   ├── layout-check/
│   │   ├── SKILL.md
│   │   └── scripts/layoutProbe.mjs
│   ├── chrome-devtools/
│   │   ├── SKILL.md
│   │   └── references/         # setup/tools/recipes — грузятся по требованию
│   ├── mcporter/SKILL.md
│   ├── mcpls/SKILL.md
│   └── zai-mcp/
│       ├── SKILL.md
│       └── references/           # tools.md (13 tools) + recipes.md (7 сценариев)
├── tools/                # CLI-утилиты
│   ├── pi-session.ts          # инспекция сессий (--summary, --grep, --context, --timeline)
│   └── pi-session.README.md
├── themes/               # Темы (пока пусто)
├── package.json
├── tsconfig.json
└── TODO.md
```

## Зависимости

- **runtime:** `diff`, `nano-staged`
- **peer:** `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`
- **dev:** `typescript`

Все peer-зависимости предоставляются самим pi-агентом, отдельно их ставить не нужно.

## Лицензия

ISC
