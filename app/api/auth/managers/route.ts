import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const employees = await prisma.employee.findMany({
    where: { appRole: { not: null } },
    select: { id: true, name: true, isPasswordSet: true, appRole: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(employees)
}
