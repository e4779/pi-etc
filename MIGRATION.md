# Migration: отдельные репозитории → pi-etc

## Шаг 1: обновить конфиг pi

Файл `~/.pi/agent/settings.json` (или эквивалентный на других ОС).

### Было

```json
{
  "packages": [
    "git:gitverse.ru/e4779/pi-qwen",
    "git:git@gitverse.ru:e4779/pi-session.git",
    "git:git@gitverse.ru:e4779/pi-way-skill.git",
    "git:git@gitverse.ru:e4779/skill-layout-check.git",
    "git:git@gitverse.ru:e4779/pi-skill-deepthink.git"
  ]
}
```

### Стало

```json
{
  "packages": [
    "git:gitverse.ru/e4779/pi-etc"
  ]
}
```

Или селективно — только нужные расширения:

```json
{
  "packages": [
    {
      "source": "git:gitverse.ru/e4779/pi-etc",
      "extensions": [
        "extensions/pi-way.ts",
        "extensions/qwen/index.ts",
        "extensions/lint-check.ts"
      ],
      "skills": [
        "pi-session",
        "deepthink",
        "layout-check"
      ]
    }
  ]
}
```

### Сопоставление: что на что

| Старый пакет | В pi-etc |
|---|---|
| `gitverse.ru/e4779/pi-qwen` | `extensions/qwen/index.ts` |
| `gitverse.ru/e4779/pi-session` | `skills/pi-session/` + `tools/pi-session.ts` |
| `gitverse.ru/e4779/pi-way-skill` | `extensions/pi-way.ts` + `skills/pi-way/` |
| `gitverse.ru/e4779/pi-skill-deepthink` | `skills/deepthink/` + `bin/tot-*` |
| `gitverse.ru/e4779/skill-layout-check` | `skills/layout-check/` |
| *(новое)* | `extensions/lint-check.ts` |

## Шаг 2: удалить локальные репозитории

После того как конфиг обновлён и `pi-etc` работает — можно удалить:

```bash
rm -rf ~/dev/pi-lint-check-extension
rm -rf ~/dev/pi-session
rm -rf ~/dev/pi-way-skill
rm -rf ~/dev/pi-skill-deepthink
rm -rf ~/dev/pi-qwen
rm -rf ~/dev/skill-layout-check
rm -rf ~/dev/pi-qwen-improve       # пустая
rm -rf ~/dev/pi-way-ws-subagents   # заброшенный
```

## Шаг 3: удалить удалённые репозитории (опционально)

После того как все устройства переведены на `pi-etc`, можно удалить репозитории на gitverse:

- `gitverse.ru/e4779/pi-qwen`
- `gitverse.ru/e4779/pi-session`
- `gitverse.ru/e4779/pi-way-skill`
- `gitverse.ru/e4779/pi-skill-deepthink`
- `gitverse.ru/e4779/skill-layout-check`

## Не трогать (остаются отдельными)

| Репозиторий | Причина |
|---|---|
| `~/dev/pi-mcporter` | Слишком тяжёлый, много файлов, пока не в монорепе |
| `~/dev/pi-subagent` | Сложный, требует отдельного рассмотрения |
| `~/dev/pi-agent-rouble-footer` | Можно добавить потом как `extensions/rouble-footer.ts` |
| `~/dev/pi-gigachat-provider` | Специфичный провайдер, не для всех |
