import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json(null, { status: 401 })
  return NextResponse.json({ name: session.name, role: session.role, shopId: session.shopId })
}
