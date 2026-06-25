import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { calcNastroykaBonus } from '@/lib/sync/nastroyka'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { from?: string; to?: string }
  const fromDate = body.from ? new Date(body.from) : undefined
  const toDate   = body.to   ? new Date(body.to + 'T23:59:59') : undefined

  try {
    const result = await calcNastroykaBonus({ fromDate, toDate })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
