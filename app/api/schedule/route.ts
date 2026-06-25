import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

function scheduleDateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// POST /api/schedule — upsert slot (create or update) by location/slotIndex/date
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json() as { location: string; slotIndex: number; date: string; employeeName?: string | null }
  const slot = await prisma.scheduleSlot.upsert({
    where: { location_slotIndex_date: { location: body.location, slotIndex: body.slotIndex, date: new Date(body.date) } },
    create: { location: body.location, slotIndex: body.slotIndex, date: new Date(body.date), employeeName: body.employeeName ?? null },
    update: { employeeName: body.employeeName ?? null },
  })
  return NextResponse.json(slot)
}

// GET /api/schedule?from=2026-05-05&to=2026-05-11
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const from = new Date(searchParams.get('from') ?? new Date())
  const to   = new Date(searchParams.get('to')   ?? new Date())

  const [slots, leaves] = await Promise.all([
    prisma.scheduleSlot.findMany({
      where: {
        date: { gte: from, lte: to },
        NOT: { location: { contains: '(2)' } },
      },
      orderBy: [{ location: 'asc' }, { slotIndex: 'asc' }, { date: 'asc' }],
    }),
    prisma.employeeLeave.findMany({
      where: { date: { gte: from, lte: to } },
      select: { employeeName: true, date: true, leaveType: true },
    }),
  ])

  // Build lookup: "employeeName__YYYY-MM-DD" → leaveType
  const leaveMap = new Map<string, string>()
  for (const l of leaves) {
    leaveMap.set(`${l.employeeName}__${scheduleDateKey(l.date)}`, l.leaveType)
  }

  const visibleSlots = session.role === 'MANAGER'
    ? slots.filter(s => s.employeeName === session.name)
    : slots

  const result = visibleSlots.map(s => ({
    ...s,
    leaveType: s.employeeName
      ? (leaveMap.get(`${s.employeeName}__${scheduleDateKey(s.date)}`) ?? null)
      : null,
  }))

  return NextResponse.json(result)
}
