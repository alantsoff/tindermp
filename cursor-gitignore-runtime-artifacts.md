# Задача: расширить .gitignore — runtime-артефакты, SQL-дампы, backup pm2-конфига

## Контекст

После инцидента с `match-web` на сервере (PM2 падал из-за сломанного `ecosystem.config.cjs`) у нас в `/var/www/tindermp` остались неотслеживаемые файлы, которые **не должны попадать в репозиторий**, но сейчас светятся в `git status` как `??`:

```
?? storage/
?? pre-backfill-20260420-084308.sql.gz
?? pre-backfill-20260420-084321.sql.gz
```

Плюс скрипт деплоя создаёт `ecosystem.config.cjs.bak.<timestamp>` перед каждой правкой — их тоже надо игнорировать.

Правка уже была сделана на сервере и проверена (git status становится чистым), но push с сервера невозможен — deploy-key read-only. Поэтому тот же коммит нужно сделать из Cursor и запушить в `origin/main`. При следующем `pnpm deploy:server` прод подтянет это через git pull.

## Что сделать

Открой `.gitignore` в корне проекта. Текущее содержимое:

```
node_modules
.env
.env.*
!.env.example
dist
.next
coverage
*.log
```

Добавь в конец **ровно этот блок** (с пустой строкой-разделителем сверху):

```
# runtime uploads / media
storage/

# db backups / dumps (создаются скриптами backfill)
pre-backfill-*.sql.gz
*.sql.gz

# локальные backup-копии pm2 конфига
ecosystem.config.cjs.bak.*
```

## Commit

Сообщение коммита:

```
chore: ignore storage/, db dumps and pm2 config backups
```

## Pre-flight проверки перед push

1. Убедись, что в `.gitignore` не дублируются правила (если вдруг `storage/` или `*.sql.gz` уже есть — не добавляй повторно).
2. Проверь, что новые правила не заигнорят ничего нужного:
   ```bash
   git check-ignore -v apps/api/src/**/* apps/web/app/**/* packages/**/* 2>&1 | head
   ```
   Ожидаемый вывод: пусто (ни один исходник под новые правила не попадает).
3. Синтаксис `.gitignore`: каждая строка либо пустая, либо комментарий с `#`, либо glob-паттерн. Не добавляй `/` в начале для `storage/` — пусть игнорируется на любом уровне.

## Push

```bash
git add .gitignore
git commit -m "chore: ignore storage/, db dumps and pm2 config backups"
git push origin main
```

## Что НЕ делать

- Не трогай `ecosystem.config.cjs` — он уже в правильном состоянии после коммитов `9ed5cda` и `6de1cba`.
- Не добавляй `ecosystem.config.cjs` в `.gitignore` (нужен, чтобы tracked), только его `.bak.*` копии.
- Не игнорируй `.env.example` — он нужен в репо (у нас уже есть `!.env.example` в текущем `.gitignore`, не затирай это исключение).
- Не пересоздавай `.gitignore` с нуля — только append в конец.

## Ожидаемый результат после push

На сервере следующий `pnpm deploy:server` подтянет коммит через `git pull --rebase`, и `git status` станет чистым: `## main...origin/main` без untracked-файлов. Файлы `storage/`, `*.sql.gz`, `ecosystem.config.cjs.bak.*` останутся на диске, но git их перестанет замечать.
