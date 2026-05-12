import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body    = await req.json()

  const work = await prisma.targetAction.findUnique({ where: { id: Number(id) } })
  if (!work) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (work.actionType !== 'Работа по ремонту') return NextResponse.json({ error: 'wrong type' }, { status: 400 })

  // Менеджер может менять только свои записи
  if (session.role === 'MANAGER' && work.employeeName !== session.name) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updates: any = {}

  if ('isTaken' in body) {
    updates.isTaken = Boolean(body.isTaken)
    if (body.isTaken) {
      const payDate = body.paymentDate ? new Date(body.paymentDate) : new Date()
      updates.takenAt     = payDate
      updates.paymentDate = payDate
    } else {
      updates.takenAt     = null
      updates.paymentDate = null
    }
  }
  if ('amount'  in body) updates.amount  = Number(body.amount)
  if ('comment' in body) updates.comment = body.comment ?? null

  const updated = await prisma.targetAction.update({ where: { id: Number(id) }, data: updates })
  return NextResponse.json({ work: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const work = await prisma.targetAction.findUnique({ where: { id: Number(id) } })
  if (!work) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (work.actionType !== 'Работа по ремонту') return NextResponse.json({ error: 'wrong type' }, { status: 400 })

  if (session.role === 'MANAGER' && work.employeeName !== session.name) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.targetAction.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}
