const BASE_URL = process.env.LIVESKLAD_BASE_URL!
const LOGIN    = process.env.LIVESKLAD_LOGIN!
const PASSWORD = process.env.LIVESKLAD_PASSWORD!

export class RateLimitError extends Error {
  constructor(public resetAt: Date, path: string) {
    super(`LiveSklad rate limit on ${path}, resets at ${resetAt.toISOString()}`)
    this.name = 'RateLimitError'
  }
}

let cachedToken: string | null = null
let tokenExpiresAt: number = 0

export async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE_URL}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ login: LOGIN, password: PASSWORD }),
    })

    if (res.status === 429) {
      const expireHeader = res.headers.get('x-ratelimit-reset')
      const resetAt = new Date(expireHeader ? expireHeader : Date.now() + 15 * 60 * 1000)
      throw new RateLimitError(resetAt, '/auth')
    }

    if (!res.ok) throw new Error(`LiveSklad auth failed: ${res.status}`)

    const data = await res.json()
    cachedToken = data.token
    tokenExpiresAt = Date.now() + data.ttl * 1000
    return cachedToken!
  }

  throw new Error('LiveSklad auth failed: too many rate limit retries')
}

export async function liveskladFetch(path: string, retries = 3): Promise<any> {
  const token = await getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: token },
  })

  if (res.status === 429) {
    const expireHeader = res.headers.get('x-ratelimit-reset')
    const resetAt = new Date(expireHeader ? expireHeader : Date.now() + 15 * 60 * 1000)
    throw new RateLimitError(resetAt, path)
  }

  if (res.status === 401) {
    // Token expired mid-sync — clear cache and retry once
    cachedToken = null
    tokenExpiresAt = 0
    if (retries > 0) {
      return liveskladFetch(path, retries - 1)
    }
    throw new Error(`LiveSklad ${path} failed: 401`)
  }

  if (!res.ok) throw new Error(`LiveSklad ${path} failed: ${res.status}`)

  const data = await res.json()

  // Предупреждение когда мало запросов осталось
  if (data.remainRequest !== undefined && data.remainRequest < 10) {
    console.warn(`[livesklad] ⚠️ only ${data.remainRequest} requests remaining`)
  }

  return data
}

export async function fetchAllPages<T>(
  buildUrl: (page: number) => string,
  pageSize = 50
): Promise<T[]> {
  const results: T[] = []
  let page = 1

  while (true) {
    const data = await liveskladFetch(buildUrl(page))
    const items: T[] = data.data ?? []
    results.push(...items)

    const total: number = data.total ?? 0
    if (page * pageSize >= total || items.length === 0) break
    page++

    await sleep(300)
  }

  return results
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
