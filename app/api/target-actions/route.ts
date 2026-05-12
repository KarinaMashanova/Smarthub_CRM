import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

const PAGE_SIZE = 100

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const employee   = searchParams.get('employee') ?? ''
  const actionType = searchParams.get('actionType') ?? ''
  const now = new Date()
  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : new Date(now.getFullYear(), now.getMonth(), 1)
  const to   = searchParams.get('to')   ? new Date(searchParams.get('to')!)   : new Date(now.setHours(23,59,59,999))

  const where: any = { date: { gte: from, lte: to } }
  if (session.role === 'MANAGER') where.employeeName = session.name
  else if (employee) where.employeeName = { contains: employee, mode: 'insensitive' }
  if (actionType) where.actionType = actionType

  const subType = searchParams.get('subType') ?? ''
  if (subType) where.subType = subType

  const [actions, total, employees, types, subTypes] = await Promise.all([
    prisma.targetAction.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, date: true, actionType: true, subType: true,
        employeeName: true, amount: true, comment: true, source: true,
        responsibleName: true, paymentDate: true, isHighMargin: true, orderId: true,
      },
    }),
    prisma.targetAction.count({ where }),
    prisma.targetAction.findMany({
      select: { employeeName: true },
      distinct: ['employeeName'],
      orderBy: { employeeName: 'asc' },
    }),
    prisma.targetAction.findMany({
      select: { actionType: true },
      distinct: ['actionType'],
    }),
    prisma.targetAction.findMany({
      where: { subType: { not: null } },
      select: { subType: true },
      distinct: ['subType'],
      orderBy: { subType: 'asc' },
    }),
  ])

  return NextResponse.json({
    actions, total, pages: Math.ceil(total / PAGE_SIZE),
    employees: employees.map(e => e.employeeName),
    types: types.map(t => t.actionType),
    subTypes: subTypes.map(s => s.subType).filter(Boolean),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const action = await prisma.targetAction.create({
    data: {
      date:            new Date(body.date),
      actionType:      body.actionType,
      subType:         body.subType || null,
      employeeName:    body.employeeName,
      amount:          Number(body.amount),
      comment:         body.comment || null,
      source:          'MANUAL',
      responsibleName: body.responsibleName || null,
      paymentDate:     body.paymentDate ? new Date(body.paymentDate) : null,
    },
  })
  return NextResponse.json(action)
}
