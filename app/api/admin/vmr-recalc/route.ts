import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { recalcVmrBonuses } from '@/lib/sync/orders'

export const maxDuration = 300

export async function POST() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const count = await recalcVmrBonuses()
    return NextResponse.json({ ok: true, count })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
