import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decodeJwt, jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'smarthub-dev-secret-change-in-prod')
const COOKIE = 'smarthub_session'

export async function GET() {
  const store = await cookies()
  const token = store.get(COOKIE)?.value

  if (!token) {
    return NextResponse.json({ hasCookie: false, message: 'Cookie not found' })
  }

  let decoded: any = null
  try {
    decoded = decodeJwt(token)
  } catch (e) {
    return NextResponse.json({ hasCookie: true, decodeError: String(e) })
  }

  let verifyError: string | null = null
  let verified = false
  try {
    await jwtVerify(token, SECRET)
    verified = true
  } catch (e) {
    verifyError = String(e)
  }

  return NextResponse.json({
    hasCookie: true,
    verified,
    verifyError,
    exp: decoded?.exp,
    expDate: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
    iat: decoded?.iat,
    iatDate: decoded?.iat ? new Date(decoded.iat * 1000).toISOString() : null,
    hasEmployeeId: !!decoded?.employeeId,
    role: decoded?.role ?? null,
    env: process.env.NODE_ENV,
    hasJwtSecret: !!process.env.JWT_SECRET,
  })
}
