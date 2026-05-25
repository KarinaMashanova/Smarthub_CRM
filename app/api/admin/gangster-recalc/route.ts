import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { calcGangsterBonuses } from '@/lib/sync/gangster'

export async function POST() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await calcGangsterBonuses()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
