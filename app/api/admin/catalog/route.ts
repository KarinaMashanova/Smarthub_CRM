import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'
import * as XLSX from 'xlsx'

const ELIGIBLE_GROUPS = ['Аксы', 'Защитное стекло', 'Игрушки', 'Чехлы']

function normGroup(g: string) {
  return g?.trim() ?? ''
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Файл не передан' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 })

  // Пропускаем заголовок
  const data = rows.slice(1).map((r: any[]) => ({
    name:          String(r[0] ?? '').trim(),
    group:         normGroup(String(r[2] ?? '')),
    purchasePrice: Number(r[3]) || 0,
    retailPrice:   Number(r[4]) || 0,
  })).filter(r => r.name && r.group)

  // Заменяем весь справочник
  await prisma.$transaction([
    prisma.productCatalog.deleteMany(),
    prisma.productCatalog.createMany({ data, skipDuplicates: true }),
  ])

  const eligibleCount = data.filter(r => ELIGIBLE_GROUPS.includes(r.group)).length
  return NextResponse.json({ ok: true, total: data.length, eligible: eligibleCount })
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const total    = await prisma.productCatalog.count()
  const eligible = await prisma.productCatalog.count({ where: { group: { in: ELIGIBLE_GROUPS } } })
  const lastUpload = await prisma.productCatalog.findFirst({ orderBy: { uploadedAt: 'desc' }, select: { uploadedAt: true } })
  return NextResponse.json({ total, eligible, lastUpload: lastUpload?.uploadedAt ?? null })
}
