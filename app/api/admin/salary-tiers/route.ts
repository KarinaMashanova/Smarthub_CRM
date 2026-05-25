import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tiers = await prisma.salaryTier.findMany({ orderBy: { minMargin: 'asc' } })
  return NextResponse.json({ tiers })
}

// Полная замена всех тиров
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { tiers } = await req.json() as { tiers: { minMargin: number; salary: number }[] }
  await prisma.salaryTier.deleteMany()
  if (tiers.length) {
    await prisma.salaryTier.createMany({ data: tiers })
  }
  const saved = await prisma.salaryTier.findMany({ orderBy: { minMargin: 'asc' } })
  return NextResponse.json({ ok: true, tiers: saved })
}
