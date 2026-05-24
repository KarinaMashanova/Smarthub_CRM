import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'smarthub-dev-secret-change-in-prod')
export const SESSION_COOKIE_NAME = 'smarthub_session'

export interface SessionPayload {
  employeeId: string
  name: string
  role: 'MANAGER' | 'ADMIN'
  shopId: string | null
}

export const SESSION_COOKIE_OPTIONS = {
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7,
  path: '/',
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE_NAME)?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, SECRET)
    const session = payload as unknown as SessionPayload
    if (!session.employeeId || !session.role) return null
    return session
  } catch {
    return null
  }
}

export async function deleteSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE_NAME)
}
