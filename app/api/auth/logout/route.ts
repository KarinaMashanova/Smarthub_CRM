import { NextResponse } from 'next/server'
import { deleteSession } from '@/lib/auth/session'

export async function GET() {
  await deleteSession()
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'), { status: 302 })
}
