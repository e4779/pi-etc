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
| **pi-way** | `extensions/pi-way.ts` | Инжектит принципы pi-way в системный промпт каждого сеанса |
| **lint-check** | `extensions/lint-check.ts` | Запускает линтеры через nano-staged после каждого хода агента |
| **qwen-flavor** | `extensions/qwen/index.ts` | Активирует Qwen Code системный промпт и edit-инструмент для Qwen-моделей |

### Скиллы (`skills/`)

| Скилл | Команда | Описание |
|---|---|---|
| **pi-way** | `/skill:pi-way` | Философия pi: саб-агенты, Makefile, PLAN.md/TODO.md, tmux |
| **pi-session** | `/skill:pi-session` | Парсинг и инспекция JSONL-сессий pi агента |
| **deepthink** | `/skill:deepthink` | Tree-of-Thoughts для сложных решений |
| **layout-check** | `/skill:layout-check` | Верификация CSS-вёрстки через Chrome DevTools |
| **chrome-devtools** | `/skill:chrome-devtools` | Управление реальной вкладкой Chrome через chrome-devtools MCP (без раздувания контекста на 18k токенов) |

### Утилиты (`tools/`, `bin/`)

| Инструмент | Назначение |
|---|---|
| `tools/pi-session.ts` | CLI для инспекции сессий: `npx tsx tools/pi-session.ts --summary` |
| `bin/tot-add` | Добавить ветку в дерево размышлений |
| `bin/tot-status` | Показать незавершённые ветки |
| `bin/tot-tree` | Отрисовать paths.txt как ASCII-дерево |

## Селективное включение

Пакет устанавливается целиком, но в настройках агента можно выбрать, какие расширения активировать.  
Файл настроек: `~/.pi/agent/settings.json` → поле `packages`.

### Пример 1: всё включено

```json
{
  "packages": [
    "git:gitverse.ru/e4779/pi-etc"
  ]
}
```

Без фильтрации — pi загрузит все расширения из `extensions/**/*.ts` и все скиллы из `skills/`.

### Пример 2: только pi-way и qwen

```json
{
  "packages": [
    {
      "source": "git:gitverse.ru/e4779/pi-etc",
      "extensions": [
        "extensions/pi-way.ts",
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
      "source": "git:gitverse.ru/e4779/pi-etc",
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
      "source": "git:gitverse.ru/e4779/pi-etc",
      "skills": [
        "layout-check",
        "deepthink"
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
      "source": "git:gitverse.ru/e4779/pi-etc",
      "extensions": [
        "extensions/pi-way.ts",
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

# Тестировать локально (без установки)
pi -e ~/dev/pi-etc/extensions/pi-way.ts
```

## Структура

```
pi-etc/
├── extensions/           # Расширения (одно .ts на расширение или вложенная директория)
│   ├── lint-check.ts
│   ├── pi-way.ts
│   └── qwen/
│       ├── index.ts
│       ├── system-prompt.ts
│       ├── edit-qwen.ts
│       └── tool-call-extractor.ts
├── skills/               # Скиллы (SKILL.md в поддиректориях)
│   ├── pi-way/SKILL.md
│   ├── pi-session/SKILL.md
│   ├── deepthink/SKILL.md
│   ├── layout-check/        
│   │   ├── SKILL.md
│   │   └── scripts/layoutProbe.mjs
│   └── chrome-devtools/
│       ├── SKILL.md
│       └── references/       # tools.md + recipes.md — грузятся по требованию
├── tools/                # CLI-утилиты
│   └── pi-session.ts
├── bin/                  # Shell-скрипты
│   ├── tot-add
│   ├── tot-status
│   └── tot-tree
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
