import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { shopId, cashAmount, cardAmount } = body
  if (!shopId) return NextResponse.json({ error: 'Missing shopId' }, { status: 400 })

  const balance = await prisma.cashBalance.upsert({
    where:  { shopId },
    update: { cashAmount: Number(cashAmount ?? 0), cardAmount: Number(cardAmount ?? 0), updatedBy: session.name },
    create: { shopId, cashAmount: Number(cashAmount ?? 0), cardAmount: Number(cardAmount ?? 0), updatedBy: session.name },
  })

  return NextResponse.json(balance)
}
