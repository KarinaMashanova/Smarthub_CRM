import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { cookies } from 'next/headers'

export async function GET() {
  const session = await getSession()
  if (!session) {
    const store = await cookies()
    const hasCookie = !!store.get('smarthub_session')?.value
    return NextResponse.json({ hasCookie, reason: hasCookie ? 'token_invalid' : 'no_cookie' }, { status: 401 })
  }
  return NextResponse.json({ name: session.name, role: session.role, shopId: session.shopId })
}
