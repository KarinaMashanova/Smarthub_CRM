import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const action = await prisma.targetAction.update({
    where: { id: Number(id) },
    data: {
      date:            body.date            ? new Date(body.date)        : undefined,
      actionType:      body.actionType      ?? undefined,
      subType:         'subType' in body    ? (body.subType || null)     : undefined,
      employeeName:    body.employeeName    ?? undefined,
      amount:          body.amount !== undefined ? Number(body.amount)   : undefined,
      comment:         'comment' in body    ? (body.comment || null)     : undefined,
      responsibleName: 'responsibleName' in body ? (body.responsibleName || null) : undefined,
      paymentDate:     'paymentDate' in body ? (body.paymentDate ? new Date(body.paymentDate) : null) : undefined,
    },
  })
  return NextResponse.json(action)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await prisma.targetAction.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}
