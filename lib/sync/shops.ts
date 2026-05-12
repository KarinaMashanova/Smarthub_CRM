import { prisma } from '@/lib/db'
import { liveskladFetch } from '@/lib/livesklad/client'

export async function syncShops() {
  const data = await liveskladFetch('/shops')
  const shops: { id: string; name: string }[] = data.data ?? []

  await prisma.$transaction(
    shops.map((s) =>
      prisma.shop.upsert({
        where: { id: s.id },
        update: { name: s.name },
        create: { id: s.id, name: s.name },
      })
    )
  )

  return shops.length
}
