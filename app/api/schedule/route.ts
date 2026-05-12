import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/schedule?from=2026-05-05&to=2026-05-11
export async function GET(req: NextRequest) {
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
    leaveMap.set(`${l.employeeName}__${l.date.toISOString().slice(0, 10)}`, l.leaveType)
  }

  const result = slots.map(s => ({
    ...s,
    leaveType: s.employeeName
      ? (leaveMap.get(`${s.employeeName}__${s.date.toISOString().slice(0, 10)}`) ?? null)
      : null,
  }))

  return NextResponse.json(result)
}
