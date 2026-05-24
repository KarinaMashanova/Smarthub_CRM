# Smarthub

Internal CRM for Smarthub operations: orders, sales, schedule, salary and bonuses, cash entries, reports, access management, and sync monitoring.

## Stack

- Next.js 16
- React 19
- Prisma 7
- PostgreSQL / Supabase
- Vercel production deploy
- GitHub Actions scheduled sync

## Local Development

```bash
npm install
npm run dev -- -H 0.0.0.0 -p 3000
```

Required local environment variables are stored in `.env` and are not committed.

For LAN testing, open `http://<machine-ip>:3000`. Development access from `192.168.0.123` is allowed in `next.config.ts`.

## Environment

```text
DATABASE_URL=
DIRECT_URL=
LIVESKLAD_BASE_URL=https://api.livesklad.com
LIVESKLAD_LOGIN=
LIVESKLAD_PASSWORD=
CRON_SECRET=
JWT_SECRET=
```

## App Routes

- `/orders` - canonical first screen, order list, filters, margin, bonuses, repair work fee
- `/sales` - sales list, positions, margin, cash bonus
- `/cash` - cash entries and revenue/expense summary
- `/schedule` - shifts, vacations, sick leave, schedule statistics
- `/salary` - target actions, bonuses, fines, repair work payouts
- `/reports` - order reports
- `/knowledge` - operating rules and access matrix
- `/admin/managers` - employee app access and roles
- `/admin/sync` - sync logs and database counters

The legacy `/dashboard` route and dashboard API were removed. Login and password setup now go directly to `/orders`.

## Auth

Authentication uses a JWT stored in the httpOnly `smarthub_session` cookie. Roles are stored on `Employee.appRole`:

- `ADMIN` - all shops, admin sections, employee access management
- `MANAGER` - scoped operational access

First-time users set a password through `/setup-password`.

## Sync

Order and sale delta sync endpoint:

```text
GET /api/cron
Authorization: Bearer <CRON_SECRET>
```

The endpoint is called every 15 minutes by GitHub Actions and runs only the current delta sync:

- orders changed in the last hour by `lastAction`
- sales in the last hour

Directory sync endpoint:

```text
GET /api/cron/employees
Authorization: Bearer <CRON_SECRET>
```

The endpoint is called every Monday at 03:00 UTC / 06:00 MSK by GitHub Actions and syncs:

- shops
- employees

Manual sync endpoints and GitHub `workflow_dispatch` triggers are intentionally disabled.

Order sync also recalculates AUTO bonuses for the changed order:

- `Бонус / За ВМР`: 20% of margin when margin is at least 4,000 RUB
- `Бонус / За наличность`: 2.5% of margin when payment is cash only

## Deployment

Production is deployed to Vercel. Vercel Hobby does not support 15-minute cron jobs, so scheduled syncs are handled by GitHub Actions.

## Prisma

```bash
npx prisma generate
npx prisma db push
```

The generated Prisma client is written to `app/generated/prisma` and is not committed.

## Checks

```bash
npm run lint
npm run build
```

Current lint strictness includes React Compiler and TypeScript rules. Keep new code clean; existing violations should be retired as files are touched.
