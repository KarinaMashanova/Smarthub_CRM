import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

// GET /api/schedule/locations — все салоны, когда-либо встречавшиеся в графике
// (нужно, чтобы сетка не пропадала на неделях, где ещё нет ни одной смены)
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role === 'MANAGER') return NextResponse.json([])

  const rows = await prisma.scheduleSlot.findMany({
    where: { NOT: { location: { contains: '(2)' } } },
    select: { location: true },
    distinct: ['location'],
  })

  return NextResponse.json(rows.map(r => r.location).sort())
}
