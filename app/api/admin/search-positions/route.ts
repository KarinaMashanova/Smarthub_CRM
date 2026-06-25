import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })

  const [op, sp] = await Promise.all([
    prisma.orderPosition.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { name: true },
      distinct: ['name'],
      orderBy: { name: 'asc' },
    }),
    prisma.salePosition.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { name: true },
      distinct: ['name'],
      orderBy: { name: 'asc' },
    }),
  ])

  const all = Array.from(new Set([...op, ...sp].map(p => p.name))).sort()
  return NextResponse.json({ count: all.length, names: all })
}
