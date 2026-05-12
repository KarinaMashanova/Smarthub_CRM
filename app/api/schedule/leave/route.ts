import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const employeeName = searchParams.get('employee')
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  const where: any = {}
  if (employeeName) where.employeeName = employeeName
  if (from || to) where.date = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }

  const records = await prisma.employeeLeave.findMany({
    where,
    orderBy: [{ employeeName: 'asc' }, { date: 'asc' }],
    select: { id: true, employeeName: true, date: true, leaveType: true },
  })

  return NextResponse.json(records)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { employeeName, from, to, leaveType } = body

  if (!employeeName?.trim() || !from || !to || !leaveType) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const fromDate = new Date(from)
  const toDate   = new Date(to)

  // Generate one record per day in range
  const days: Date[] = []
  const cur = new Date(fromDate)
  while (cur <= toDate) {
    days.push(new Date(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  await prisma.employeeLeave.createMany({
    data: days.map(d => ({
      employeeName: employeeName.trim(),
      date: d,
      leaveType,
    })),
    skipDuplicates: true,
  })

  return NextResponse.json({ count: days.length })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const employeeName = searchParams.get('employee')
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!employeeName || !from || !to) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const result = await prisma.employeeLeave.deleteMany({
    where: {
      employeeName,
      date: { gte: new Date(from), lte: new Date(to) },
    },
  })

  return NextResponse.json({ count: result.count })
}
