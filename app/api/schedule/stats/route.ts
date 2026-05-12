import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const from     = new Date(searchParams.get('from') ?? '2026-01-01')
  const today    = new Date(); today.setHours(23, 59, 59, 999)
  const requested = new Date(searchParams.get('to') ?? today)
  const to       = requested > today ? today : requested
  const location = searchParams.get('location') ?? undefined

  const slotWhere: any = { date: { gte: from, lte: to } }
  if (location) slotWhere.location = location
  if (session.role === 'MANAGER') slotWhere.employeeName = session.name

  const leaveWhere: any = { date: { gte: from, lte: to } }
  if (session.role === 'MANAGER') leaveWhere.employeeName = session.name

  const [slots, leaves] = await Promise.all([
    prisma.scheduleSlot.findMany({
      where: slotWhere,
      select: { employeeName: true, location: true },
    }),
    prisma.employeeLeave.findMany({
      where: leaveWhere,
      select: { employeeName: true, leaveType: true },
    }),
  ])

  const byEmployee: Record<string, {
    total: number; vacation: number; sick: number; locations: Record<string, number>
  }> = {}

  for (const s of slots) {
    if (!s.employeeName) continue
    const n = s.employeeName
    if (!byEmployee[n]) byEmployee[n] = { total: 0, vacation: 0, sick: 0, locations: {} }
    byEmployee[n].total++
    byEmployee[n].locations[s.location] = (byEmployee[n].locations[s.location] ?? 0) + 1
  }

  for (const l of leaves) {
    if (!byEmployee[l.employeeName]) byEmployee[l.employeeName] = { total: 0, vacation: 0, sick: 0, locations: {} }
    if (l.leaveType === 'VACATION') byEmployee[l.employeeName].vacation++
    else if (l.leaveType === 'SICK') byEmployee[l.employeeName].sick++
  }

  const stats = Object.entries(byEmployee)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => (b.total + b.vacation + b.sick) - (a.total + a.vacation + a.sick))

  const locations = await prisma.scheduleSlot.findMany({
    select: { location: true },
    distinct: ['location'],
    orderBy: { location: 'asc' },
  })

  return NextResponse.json({ stats, locations: locations.map(l => l.location) })
}
