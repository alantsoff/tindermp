# PM2 / ecosystem.config.cjs — чего нельзя делать (для Cursor)

Инцидент: сервер tindermp, `match-web` падал в бесконечный ELIFECYCLE, порт 3100 не слушался, nginx возвращал 502 на `/`. Причина — сломанный `ecosystem.config.cjs`, который ранее сгенерил/отредактировал AI-ассистент.

## Что было неправильно

```js
// match-web (ПЛОХО)
{
  name: 'match-web',
  cwd: '/var/www/tindermp/apps/web',
  script: 'pnpm',
  args: 'start -- -p 3100 -H 127.0.0.1',   // <-- смертельно для Next 16
  ...
}
```

Почему это убивает прод:

1. В Next 16 `next start` трактует `--` как «конец опций». Всё после `--` становится **позиционными** аргументами. `-p` превращается в путь-директорию, Next валится с `Invalid project directory provided, no such directory: .../apps/web/-p` и выходит с кодом 1.
2. `pnpm run start` с хвостом `-- -p 3100` тоже опасен: у pnpm есть собственный глобальный флаг `-p`, который он парсит ДО `--` в ряде версий. Даже если пронесёт — см. пункт 1.
3. PM2 из-за этого рестартит процесс до `max_restarts`, потом отмечает `errored` — сервис лежит.

Аналогичная ошибка была в `match-api`: `interpreter: 'bash'` + `args: 'dist/src/main.js'` → bash пытался исполнить JS как shell-скрипт (`/usr/bin/bash: dist/src/main.js: No such file or directory`).

## Правила для любых будущих правок

**Для Next.js (web) всегда запускать напрямую через node, без pnpm-обёртки:**

```js
{
  name: 'match-web',
  cwd: '/var/www/tindermp/apps/web',
  script: 'node',
  args: 'node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3100',
  env: {
    NODE_ENV: 'production',
    PORT: '3100',
    NODE_OPTIONS: '--max-old-space-size=768',
  },
  autorestart: true,
  max_restarts: 50,
  restart_delay: 4000,
  min_uptime: 10000,
  max_memory_restart: '900M',
}
```

**Для Nest.js (api) — тоже через node, интерпретатор не трогать:**

```js
{
  name: 'match-api',
  cwd: '/var/www/tindermp/apps/api',
  script: 'node',
  args: 'dist/src/main.js',
  env: { NODE_ENV: 'production', PORT: '3001' },
  autorestart: true,
  max_restarts: 20,
  restart_delay: 3000,
  max_memory_restart: '512M',
}
```

### Запрещено

- `script: 'pnpm'` с `args`, содержащими `-- -p <port>` — никогда. `--` перед `-p` в Next 16 ломает парсинг.
- `interpreter: 'bash'` для JS-скриптов.
- `script: 'bash'` / `script: 'sh'` в сочетании с `args`, указывающим на `.js` файл.
- Редактировать `ecosystem.config.cjs` на сервере без коммита в репо. Следующий `deploy-pull-build.sh` либо затрёт правку, либо не затрёт (зависит от локальных изменений) — и в любом случае возникает расхождение, из-за которого `pm2 startOrReload` поднимает непредсказуемое состояние. Все изменения — через git.
- `pm2 restart --update-env` после смены `script`/`args`. `--update-env` обновляет только environment, исполняемый файл остаётся старым. После смены `script`/`args` **всегда** `pm2 delete <name>` → `pm2 start ecosystem.config.cjs --only <name>`.

### Обязательно

- После правки `ecosystem.config.cjs` прогнать синтаксис-чек: `node -e "require('./ecosystem.config.cjs'); console.log('ok')"`.
- Проверить параметры процесса после старта: `pm2 describe <name>` → в строках `script path`, `exec interpreter`, `script args` не должно быть `bash`/`sh`, должно быть `node` и нужный путь.
- После смены конфигурации — `pm2 save`, иначе после reboot поднимется старый dump.
- Проверить слушающие порты: `ss -ltnp | grep -E '3001|3100'`.
- Если в логах цикл одной и той же ошибки — сначала `pm2 flush <name>`, потом пересоздать процесс, потом читать логи. Старые записи без ротации вводят в заблуждение.
- Поставить ротацию логов на сервере: `pm2 install pm2-logrotate`, `pm2 set pm2-logrotate:max_size 10M`, `pm2 set pm2-logrotate:retain 7`.

## Чек-лист перед commit’ом правки ecosystem.config.cjs

1. `node -e "require('./ecosystem.config.cjs')"` — синтаксис ок.
2. У каждого app `script` — это `node` (или абсолютный путь к исполняемому бинарю), а не `pnpm`/`bash`.
3. В `args` нет `--` перед флагами, которые должен получить внутренний бинарь.
4. Для Next указан `-H 0.0.0.0 -p <port>` (или только `-p`, но не `-- -p`).
5. У match-web `max_memory_restart` ≥ 700M (Next 16 + React 19 берёт много).
6. Коммит и деплой через `scripts/deploy-pull-build.sh`, без ручной правки на сервере.
