// Fix schedule location names after CSV import
// Run from web/ directory: node --env-file=.env scripts/fix-schedule-locations.mjs

import pkg from 'pg'
const { Pool } = pkg
const pool = new Pool({ connectionString: process.env.DIRECT_URL })

// Simple renames: CSV name → real name in DB
const RENAMES = [
  ['Волжский',         'Волжский SmartHub'],
  ['Детский мир',      'Детский Мир Smarthub'],
  ['МТВ Applehub',     'МТВ Центр Applehub'],
  ['МТВ Smarthub',     'МТВ Центр Smarthub'],
  ['Мадагаскар',       'Мадагаскар Smarthub'],
  ['Питер Onlyphons',  'Питер OnlyPhons'],
  ['ТЦ Москва Smarthub', 'Москва Smarthub'],
  ['Турист',           'Турист OnlyPhons'],
]

// Дом Мод: distribute CSV slotIndex 0-10 across 4 shops
// round-robin: Amazos, Applehub, OnlyPhons, Smarthub
const DOM_MOD_SHOPS = [
  'Дом Мод Amazos',
  'Дом Мод Applehub',
  'Дом Мод OnlyPhons',
  'Дом Мод Smarthub',
]
// CSV slotIndex → [targetShop, targetSlotIndex] — 2 rows per shop
// 0,1 → Amazos; 2,3 → Applehub; 4,5 → OnlyPhons; 6,7 → Smarthub; 8-10 → drop
const DOM_MOD_MAP = {
  0: ['Дом Мод Amazos',    0],
  1: ['Дом Мод Amazos',    1],
  2: ['Дом Мод Applehub',  0],
  3: ['Дом Мод Applehub',  1],
  4: ['Дом Мод OnlyPhons', 0],
  5: ['Дом Мод OnlyPhons', 1],
  6: ['Дом Мод Smarthub',  0],
  7: ['Дом Мод Smarthub',  1],
}

async function doRename(from, to) {
  // Get all records for the source location
  const { rows } = await pool.query(
    `SELECT id, location, "slotIndex", date, "employeeName" FROM "ScheduleSlot" WHERE location = $1`,
    [from]
  )
  if (!rows.length) { console.log(`  ${from}: 0 records, skip`); return }

  let moved = 0, skipped = 0
  for (const row of rows) {
    await pool.query(
      `INSERT INTO "ScheduleSlot" (location, "slotIndex", date, "employeeName", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (location, "slotIndex", date)
       DO UPDATE SET "employeeName" = EXCLUDED."employeeName", "updatedAt" = NOW()`,
      [to, row.slotIndex, row.date, row.employeeName]
    )
    moved++
  }

  // Delete source records
  await pool.query(`DELETE FROM "ScheduleSlot" WHERE location = $1`, [from])
  console.log(`  ${from} → ${to}: moved ${moved}, deleted source`)
}

async function doDomMod() {
  const { rows } = await pool.query(
    `SELECT id, "slotIndex", date, "employeeName" FROM "ScheduleSlot" WHERE location = 'Дом Мод' ORDER BY "slotIndex", date`
  )
  if (!rows.length) { console.log('  Дом Мод: 0 records, skip'); return }

  console.log(`  Дом Мод: ${rows.length} records to redistribute`)

  let moved = 0, dropped = 0
  for (const row of rows) {
    const mapping = DOM_MOD_MAP[row.slotIndex]
    if (!mapping) { dropped++; continue }
    const [targetShop, targetSlot] = mapping

    await pool.query(
      `INSERT INTO "ScheduleSlot" (location, "slotIndex", date, "employeeName", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (location, "slotIndex", date)
       DO UPDATE SET "employeeName" = EXCLUDED."employeeName", "updatedAt" = NOW()`,
      [targetShop, targetSlot, row.date, row.employeeName]
    )
    moved++
    process.stdout.write(`\r    distributed ${moved}/${rows.length}...`)
  }

  await pool.query(`DELETE FROM "ScheduleSlot" WHERE location = 'Дом Мод'`)
  console.log(`\n  Дом Мод: distributed ${moved} records (dropped ${dropped}), source deleted`)
  console.log('  Distribution:')
  DOM_MOD_SHOPS.forEach((shop, i) => {
    const slots = [0, 1, 2].filter(si => Object.entries(DOM_MOD_MAP).some(([idx, [s, t]]) => s === shop && t === si))
    console.log(`    ${shop}: CSV rows ${Object.entries(DOM_MOD_MAP).filter(([, [s]]) => s === shop).map(([i]) => i).join(', ')}`)
  })
}

async function main() {
  console.log('=== Fix schedule locations ===\n')

  console.log('Simple renames:')
  for (const [from, to] of RENAMES) {
    await doRename(from, to)
  }

  console.log('\nДом Мод distribution:')
  await doDomMod()

  // Show final state
  const { rows: final } = await pool.query(
    `SELECT location, COUNT(*) as cnt FROM "ScheduleSlot" GROUP BY location ORDER BY location`
  )
  console.log('\n=== Final locations ===')
  final.forEach(r => console.log(`  ${r.location}: ${r.cnt} slots`))

  await pool.end()
}

main().catch(e => { console.error(e); process.exitCode = 1 })
