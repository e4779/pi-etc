<!--
Background reading for the lint-check extension.

This is the wiki synthesis of the Evil Martians article that inspired the
extension. Read it to understand WHY lint-check is designed the way it is
— in particular the mandatory-gate / Stop-hook + exit 2 pattern that
nano-staged + this extension implement together.

Source: https://evilmartians.com/chronicles/stop-writing-rules-in-agents-md-use-agent-hooks-and-nano-staged-instead
-->


Original: <https://evilmartians.com/chronicles/stop-writing-rules-in-agents-md-use-agent-hooks-and-nano-staged-instead>

КРАТКО
======

Статья Андрея Ситника (Evil Martians, май 2026): не пишите правила
в AGENTS.md — выносите их в agent hooks + nano-staged. Линтеры
и formatter'ы надёжнее инструкций в тексте: LLM их не забывает,
и они не тратят токены. Статья — прямой источник вдохновения для
нашего review-gate extension и wiki-review-gate hook.

ЦЕНТРАЛЬНЫЙ ТЕЗИС
=================

  «If possible, an automation script (on CI or in a pre-commit hook)
   is better than an instruction in documentation.»

То же самое для LLM: правило в formatter config или кастомном
линтере лучше, чем правило в AGENTS.md. LLM часто забывают
инструкции из AGENTS.md, а скрипты — надёжнее и дешевле в токенах.

*Автоматизация бьёт документацию.* Для LLM работает так же,
  как для людей. DX агента — такая же реальная проблема,
  как и DX человека.

ЧТО ТАКОЕ AGENT HOOKS
=====================

Современные агенты поддерживают хуки — скрипты, запускаемые
после определённых событий:

  * Claude Code hooks (события: PreToolUse, PostToolUse, Stop, …)
  * OpenAI Codex hooks
  * OpenCode (плагины)

Для нашей задачи нужно событие *Stop* — срабатывает,
когда LLM закончил обработку промпта.

Механика:
  * Хук получает JSON на stdin с данными процесса
  * Exit code 2 → агент продолжает работу (не останавливается)
  * Codex: нужен wrapper, печатающий `{"continue":true}` или
    `{"decision":"block","reason":"…"}`

ЧТО ТАКОЕ NANO-STAGED
=====================

nano-staged — pre-commit менеджер, запускает линтеры/formatter'ы
только на изменённых файлах. В отличие от lint-staged:

  * 0 зависимостей (против 24 у lint-staged)
  * Специальные оптимизации для LLM (экономия токенов)
  * В 1.5 раза быстрее
  * Меньше поверхность для supply chain атак

Специальные флаги для LLM:

  * *--unstaged* — проверять все изменённые файлы (не только staged)
  * *--quiet* — ужать вывод для экономии токенов
  * *--bail* — выход на первой ошибке для быстрого фидбек-лупа

Для не-JS проектов: lefthook.

КОНФИГУРАЦИЯ (ПОЛНЫЙ РЕЦЕПТ)
============================

  1. Установка:

    pnpm add --save-dev nano-staged

  2. Конфиг .nano-staged.json:

    {
      "*": "oxfmt --no-error-on-unmatched-pattern",
      "**/*.{js,ts,jsx,tsx}": "oxlint",
      "**/*.css": "stylelint --fix"
    }

  3. Хук в .claude/settings.json:

    {
      "hooks": {
        "Stop": [
          {
            "hooks": [
              {
                "type": "command",
                "command": "./node_modules/.bin/nano-staged --unstaged --quiet --bail || exit 2"
              }
            ]
          }
        ]
      }
    }

  4. Git hook (husky) — тот же nano-staged на pre-commit:

    pnpm add --save-dev husky
    pnpm husky init
    echo "./node_modules/.bin/nano-staged" > .husky/pre-commit

ПОЧЕМУ СКОРОСТЬ ВАЖНА
=====================

Хуки могут выполняться много раз за сессию. Агент проверяет
результат после каждого запуска, вызывает тулы, снова проверяет.
Быстрые инструменты — быстрый фидбек-луп.

  30 секунд на хук × дюжина хуков за сессию × каждый инженер
  в команде = реальные деньги и потерянный momentum.

*oxlint и oxfmt* — next-gen линтеры и formatter'ы на Rust/Go.
В 5-10 раз быстрее ESLint и Prettier.

  * oxfmt: 1:1 совместимость с Prettier, поддержка Vue/Svelte
  * oxlint: поддержка ESLint-плагинов, встроенный TypeScript
    (Go-версия TS), 1.5-2× быстрее чем tsgo + oxlint по
    отдельности

Evil Martians уже используют oxlint — включая сайт,
на котором опубликована статья.

*Быстрый фидбек-луп = меньше выгорания агента.*
  Каждая секунда ожидания — это потеря контекста и momentum'а.

ЗАЩИТА ОТ БЕСКОНЕЧНОГО ЦИКЛА
============================

Проблема: в неинтерактивном режиме (software factory) агент
может застрять в бесконечном цикле, если не может исправить
ошибку линтера — каждый раз хук возвращает exit 2, агент
пытается снова.

Решение — wrapper-скрипт с проверкой stop_hook_active:

  #!/bin/bash
  INPUT=$(cat)
  ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active')

  if [ "$ACTIVE" = "true" ]; then
    nano-staged || true
    exit 0
  fi

  nano-staged || exit 2

Если агент уже в цикле принудительного продолжения — не
блокировать повторно. Второй раз хук просто выполняется
(или не выполняется) и возвращает 0.

ФИЛОСОФИЯ: ПРАВИЛА КАК КОД
==========================

*Каждое правило, которое можно закодировать в инструмент —
  это правило, которое LLM не может забыть, и токен, который
  не нужно тратить на напоминание.*

По мере того как агенты берут на себя всё больше клавиатуры,
разрыв между командами, которые автоматизируют guardrails,
и теми, кто записывает их в AGENTS.md, будет быстро расти.

Хуки и pre-commit менеджеры — дешёвая, скучная инфраструктура,
которая держит вас на правильной стороне.

СВЯЗЬ С НАШЕЙ ВИКИ
==================

ПРЯМАЯ ЛИНИЯ ВЛИЯНИЯ
--------------------

Статья Evil Martians → наш review-gate extension и wiki-review-gate
hook. Хронология:

  1. Статья опубликована 2026-05-26
  2. Пользователь читает → предлагает добавить хук на subagent
  3. Создаётся .pi/extensions/wiki-review-gate.ts
  4. Позже переносится глобально: ~/.pi/agent/extensions/review-gate.ts

*Мы реализовали паттерн из статьи ещё до того, как
  формально прочитали её.* Интуиция «автоматизация лучше
  документации» привела к тому же решению.

ЧТО ДЕЛАЕТ НАШ REVIEW-GATE
--------------------------

  * Запоминает HEAD до запуска subagent
  * После subagent: git diff, детектит конфликты
    (два параллельных агента тронули один файл)
  * Показывает diff в выводе subagent с блоком REVIEW GATE

Это тот же паттерн, что и nano-staged в Stop hook:
автоматическая проверка после действия агента. Только
у нас — проверка консистентности вики (index, orphan-страницы),
а не линтинг кода.

ОТЛИЧИЯ НАШЕГО ПОДХОДА
----------------------

  ┌─────────────────────────┬──────────────────────────────────┐
  │ Evil Martians           │ Наш review-gate                  │
  ├─────────────────────────┼──────────────────────────────────┤
  │ Stop hook (конец хода)  │ После возврата из subagent       │
  │ nano-staged (линтинг)   │ git diff + health check          │
  │ Линтеры кода            │ Линтеры вики (консистентность)   │
  │ Exit 2 = продолжить     │ Diff в выводе = человек решает   │
  │ ─────────────────────── │ ──────────────────────────────── │
  │ Для production-кода     │ Для knowledge base               │
  └─────────────────────────┴──────────────────────────────────┘

Общий принцип: *автоматическая проверка после каждого
значимого действия агента.* Не полагаться на то, что
агент «помнит» правила.

ДРУГИЕ ИДЕИ ИЗ СТАТЬИ, ПРИМЕНИМЫЕ К ВИКИ
----------------------------------------

*Кастомные линтеры для вики.* Статья: «Если LLM повторяет
  ошибку — попросите его написать кастомное ESLint-правило.»
  Для вики: если агент повторяет ошибку форматирования —
  написать скрипт-чекер (аналог lint-операции Карпатого).

*nano-staged для pages?* Технически применимо: nano-staged
  может проверять только изменённые .txt страницы на
  соответствие конвенциям. Но пока масштаб мал, grep
  и ручная проверка достаточны.

*oxlint для markdown?* Не применимо напрямую (мы plain-text,
  не Markdown). Но идея «быстрого линтера» для .txt конвенций
  может быть полезна при росте вики.

ЗАМЕТКИ ДЛЯ БУДУЩЕГО
--------------------

* Формальный lint-скрипт для проверки конвенций .txt
* Health check как nano-staged hook для вики
* При росте вики: выделенный линтер, а не grep
* Интеграция с pi hooks (если появятся)

SEE ALSO
--------

- [Wiki Creation Session](/wiki-creation-session.md) — здесь родился review-gate
- [Karpathy LLM Wiki](/karpathy-llm-wiki.md) — Lint-операция как часть паттерна
- [Qwen Prompting Agents](/qwen-prompting-agents.md) — конфигурация агентов Qwen Code (SubAgents, форки, permission modes)
- [Scar Driven Agent Docs](/scar-driven-agent-docs.md) — narrative AGENTS.md format (opposite extreme to hooks)
