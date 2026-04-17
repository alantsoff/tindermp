# match-app

Отдельный проект Telegram Mini App Match (с нуля, без зависимостей от legacy API/ботов).

## Stack

- `apps/api`: NestJS + Prisma
- `apps/web`: Next.js App Router
- `packages/db`: Prisma schema/client

## Local start

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:generate
pnpm dev
```

API health: `http://localhost:3001/health`  
Mini-app route: `http://localhost:3000/m`

## Production

См. [`docs/DEPLOY.md`](docs/DEPLOY.md)
