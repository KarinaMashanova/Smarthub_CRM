import { NextResponse } from 'next/server'
import { runBackfillSync } from '@/lib/sync'
import { getSession } from '@/lib/auth/session'
import { RateLimitError } from '@/lib/livesklad/client'

export const maxDuration = 300

export async function POST(request: Request) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let from: string, to: string
  try {
    const body = await request.json()
    from = body.from
    to   = body.to
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }

  const fromDate = new Date(from)
  const toDate   = new Date(to)

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  if (fromDate >= toDate) {
    return NextResponse.json({ error: 'from must be before to' }, { status: 400 })
  }

  try {
    const result = await runBackfillSync(fromDate, toDate)
    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'rate_limit', retryAfter: error.resetAt.toISOString() },
        { status: 429 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
