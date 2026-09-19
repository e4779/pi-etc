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

> Расширение загружается, только если его файл прописан в `pi.extensions` в `package.json`.
> Новое расширение = новый файл **и** запись в манифесте.

| Расширение | Файл | Описание |
|---|---|---|
| **lint-check** | `extensions/lint-check/index.ts` | Запускает линтеры через nano-staged после каждого хода агента |
| **qwen-flavor** | `extensions/qwen/index.ts` | Активирует Qwen Code системный промпт и edit-инструмент для Qwen-моделей |
| **box** | `extensions/box/index.ts` | Distrobox-интеграция: тулы `box_list` / `box_exec` — ставить пакеты, собирать и тестировать в контейнере, а не на хосте. Создание/удаление боксов сознательно не автоматизировано (решение человека, см. `skills/box/SKILL.md`) |
| **whoami** | `extensions/whoami/index.ts` | Инжектит идентичность модели в системный промпт (модели через API часто называют себя неправильно). Поведенческие профили — в `PROFILES` в `index.ts`, см. `extensions/whoami/README.md` |
| **fabric-bun-guidance** | `extensions/fabric-bun-guidance/index.ts` | Подменяет дефолтное execution-руководство pi-fabric (slot `fabric.execution`) на Bun-first примеры на машинах с bun-process гостом |
| **inject-default-skills** | `extensions/inject-default-skills/index.ts` | Always-on скиллы: инжектит выбранные скиллы целиком в системный промпт через `before_agent_start` (pi грузит скиллы лениво, и модели не всегда их поднимают) |
| **context-guard** | `extensions/context-guard/index.ts` | Автоматически выносит слишком большие результаты `fabric_exec` из контекста модели: полный текст кладётся content-addressed на диск, модели остаётся дайджест + путь |
| **llm** | `extensions/llm/index.ts` | Голый inference-примитив для госта `fabric_exec`: один completion за вызов, без тулов/памяти/оверхода сабагента — для map/reduce по уже имеющимся чанкам |
| **co-author** | `extensions/co-author/index.ts` | ⚠️ Не зарегистрирован в манифесте `pi.extensions` — не загружается. Автоматически добавлял бы `Co-authored-by:` trailer к `git commit` по текущей модели (маппинг в `~/.pi/agent/coauthors.json`) |

Общие хелперы расширений лежат в `extensions/lib/` (`fabric-detect.ts`).

### PI WEB плагины (`pi-web-plugins/`)

> Браузерные плагины pi-web: установка — symlink в `~/.pi-web/plugins/<id>` + жёсткая перезагрузка вкладки (плагинам с serverModule нужен ещё и рестарт sessiond). Контракт и примеры — `docs/plugins.md` в пакете pi-web.

| Плагин | Описание |
|---|---|
| **diagrams** | Панель «Diagrams» в workspace: рендерит `diagrams/*.mmd` (mermaid@11) и `diagrams/*.drawio` (mxGraph GraphViewer), живой опрос 4 сек, ошибки рендера инлайн. Детали — `pi-web-plugins/diagrams/README.md` |

### Скиллы (`skills/`)

| Скилл | Команда | Описание |
|---|---|---|
| **fabric-memory** | `/skill:fabric-memory` | Поиск и чтение старых сессий через memory-провайдер pi-fabric (`memory.recall / expand / walk / sessions`) в `fabric_exec`. Археология сессий. Заменяет pi-session — вручную JSONL не грепать |
| **bun-runtime** | `/skill:bun-runtime` | Bun-first правила для bun-process госта `fabric_exec`: import ladder, выбор Bun Shell vs `pi.*`, таймеры, пустой вывод/exitCode. Глубокие рецепты — `REFERENCE.md` рядом |
| **fabric-orchestration** | `/skill:fabric-orchestration` | Дерево решений для оркестрации в `fabric_exec`: напрямую / параллельный fan-out / рекурсивная декомпозиция; контракты верифаеров; mesh-биндинги между фазами |
| **github** | `/skill:github` | GitHub через github MCP: поиск репо/кода/issue, PR, ревью, мердж |
| **mcporter** | `/skill:mcporter` | Обзор mcporter CLI: discovery, вызов и управление MCP-серверами |
| **layout-check** | `/skill:layout-check` | Верификация CSS-вёрстки через Chrome DevTools |
| **chrome-devtools** | `/skill:chrome-devtools` | Управление реальной вкладкой Chrome через chrome-devtools MCP |
| **zai-mcp** | `/skill:zai-mcp` | Веб-поиск, страница→markdown, семантическое чтение GitHub-репо, OCR/анализ изображений и видео через 4 Z.AI MCP сервера |
| **mcpls** | `/skill:mcpls` | Семантическая навигация по коду через LSP (mcpls MCP→LSP мост): определения, ссылки, символы, диагностики, ренейм-рефакторинг |
| **grill** | `/skill:grill` | Сократические сессии проработки идеи: раунды интервью по одному вопросу, каждый раунд выращивает drawio-майндмапу; в конце — текстовый аутлайн |
| **mindmap** | `/skill:mindmap` | Создание/выращивание/починка drawio-майндмап: центральный узел, цвет на ветку, органичные кривые |
| **box** | `/skill:box` | Конвенции distrobox: что делается в боксе, что на хосте (пакеты — только в боксе, git — всегда на хосте) |
| **skill-author** | `/skill:skill-author` | Авторство и валидация скиллов (SKILL.md): правила frontmatter, YAML-грабли, валидатор skills-ref |
| **pi-session** | `/skill:pi-session` | *(legacy)* Парсинг и инспекция JSONL-сессий pi через `tools/pi-session.ts`. Заменён fabric-memory — остаётся для сред без pi-fabric |

### Утилиты (`tools/`)

| Инструмент | Назначение |
|---|---|
| `tools/pi-session.ts` | CLI для инспекции сессий: `npx tsx tools/pi-session.ts --summary` |
| `tools/install-hooks.mjs` | Ставит pre-commit хук (гейт `lint:skills`); запускается сам через `postinstall` при `npm install` |

## Селективное включение

Пакет устанавливается целиком, но в настройках агента можно выбрать, какие расширения и скиллы активировать.  
Файл настроек: `~/.pi/agent/settings.json` → поле `packages`.

### Пример 1: всё включено

```json
{
  "packages": [
    "git:git@gitverse.ru:e4779/pi-etc.git"
  ]
}
```

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

### Пример 3: всё, кроме… (негация)

Запись с префиксом `-` **исключает** элемент из полного набора:

```json
{
  "packages": [
    {
      "source": "git:git@gitverse.ru:e4779/pi-etc.git",
      "extensions": [
        "-extensions/lint-check/index.ts",
        "-extensions/qwen/index.ts"
      ],
      "skills": ["-skills/pi-session"]
    }
  ]
}
```

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
        "-extensions/lint-check/index.ts"
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

# Установить зависимости (+ pre-commit хук через postinstall)
npm install

# Проверить типы
npx tsc --noEmit

# Проверить скиллы (frontmatter SKILL.md по спеке Agent Skills)
npm run lint:skills

# Собрать одно расширение для быстрой проверки
bun build extensions/whoami/index.ts --no-bundle

# Тестировать расширение локально (без установки)
pi -e extensions/qwen/index.ts
```

Новое расширение: файл в `extensions/<name>/index.ts` **плюс регистрация** в `pi.extensions` в `package.json` — без записи в манифесте пакет его не отдаёт.

## Структура

```
pi-etc/
├── extensions/        # Расширения: один index.ts или директория (+ README.md у сложных)
│   ├── lib/           # общие хелперы (fabric-detect.ts)
│   └── <9 расширений, см. таблицу выше>
├── skills/            # Скиллы: skills/<name>/SKILL.md (+ references/, scripts/ по мере надобности)
├── pi-web-plugins/    # браузерные плагины pi-web: diagrams (панель mermaid/drawio)
├── themes/            # Темы (пока пусто)
├── tools/             # CLI-утилиты (pi-session.ts, install-hooks.mjs)
├── package.json       # манифест пакета: pi.extensions / skills / themes
├── tsconfig.json
└── TODO.md
```

Актуальный состав: `ls extensions skills tools`.

## Зависимости

- **runtime:** `diff`, `nano-staged`
- **peer:** `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`
- **dev:** `typescript`, `@earendil-works/pi-ai`

Все peer-зависимости предоставляются самим pi-агентом, отдельно их ставить не нужно.

## Лицензия

ISC
