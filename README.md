# Smarthub

Internal Next.js app for Smarthub operations: orders, sales, schedule, salary/bonuses, cash entries, reports, and admin tools.

## Stack

- Next.js 16
- React 19
- Prisma 7
- PostgreSQL / Supabase
- Vercel production deploy

## Local Development

```bash
npm install
npm run dev
```

Required local environment variables are stored in `.env` and are not committed.

## Sync

Production sync endpoint:

```text
GET /api/cron
Authorization: Bearer <CRON_SECRET>
```

The endpoint runs only the current delta sync:

- orders changed in the last hour by `lastAction`
- sales in the last hour

Order sync also recalculates AUTO bonuses for the changed order:

- `Бонус / За ВМР`: 20% of margin when margin is at least 4,000 RUB
- `Бонус / За наличность`: 2.5% of margin when payment is cash only

## Deployment

Production is deployed to Vercel. Vercel Hobby does not support 15-minute cron jobs, so the 15-minute schedule should be handled by an external scheduler calling `/api/cron`.

## Prisma

```bash
npx prisma generate
npx prisma db push
```
