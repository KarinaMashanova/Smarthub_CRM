import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  const data: Record<string, unknown> = {}
  if ('employeeName' in body) data.employeeName = body.employeeName?.trim() || null

  const slot = await prisma.scheduleSlot.update({
    where: { id: Number(id) },
    data,
  })

  return NextResponse.json(slot)
}
