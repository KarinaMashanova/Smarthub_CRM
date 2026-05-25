// Import schedule data from CSV into ScheduleSlot table
// Run from web/ directory: node --env-file=.env scripts/import-schedule-csv.mjs

import pkg from 'pg'
const { Pool } = pkg
import { readFileSync } from 'fs'

const CSV_PATH = '/Users/karinamasanova/Desktop/Smarthub/Расписание смен сотрудников - График (1).csv'

function parseCSVLine(line) {
  const cols = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cols.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cols.push(current)
  return cols
}

function parseDate(str) {
  const parts = str.trim().split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

async function main() {
  // Need direct URL for scripts (not pooler with pgbouncer)
  const connString = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!connString) throw new Error('Missing DATABASE_URL or DIRECT_URL env var')

  const pool = new Pool({ connectionString: connString })

  const content = readFileSync(CSV_PATH, 'utf-8')
  const lines = content.split('\n')
  const rows = lines.map(parseCSVLine)

  // Row index 5 = date row; dates start at column 2
  const dateRow = rows[5]
  const dateCols = []
  for (let i = 2; i < dateRow.length; i++) {
    const v = dateRow[i]?.trim()
    if (!v) continue
    const date = parseDate(v)
    if (date) dateCols.push({ colIndex: i, date })
  }
  console.log(`Parsed ${dateCols.length} date columns (${dateCols[0]?.date} → ${dateCols.at(-1)?.date})`)

  // Build all records to upsert
  const locationCounts = {}
  const records = []

  for (let rowIdx = 6; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]
    const location = row[0]?.trim() ?? ''
    if (!location) continue
    if (/\(2\)/.test(location)) continue  // skip placeholder rows

    if (!locationCounts[location]) locationCounts[location] = 0
    const slotIndex = locationCounts[location]
    locationCounts[location]++

    for (const { colIndex, date } of dateCols) {
      const empName = row[colIndex]?.trim() ?? ''
      const employeeName = empName || null
      if (!employeeName) continue
      records.push({ location, slotIndex, date, employeeName })
    }
  }

  console.log(`Built ${records.length} records to upsert across ${Object.keys(locationCounts).length} locations`)

  // Batch upsert in chunks of 50
  const CHUNK = 50
  let done = 0

  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK)

    // Build VALUES with $1, $2, ... placeholders
    const params = []
    const valueParts = chunk.map((r) => {
      const base = params.length
      params.push(r.location, r.slotIndex, r.date, r.employeeName)
      return `($${base + 1}, $${base + 2}, $${base + 3}::date, $${base + 4}, NOW())`
    })

    await pool.query(
      `INSERT INTO "ScheduleSlot" (location, "slotIndex", date, "employeeName", "updatedAt")
       VALUES ${valueParts.join(', ')}
       ON CONFLICT (location, "slotIndex", date)
       DO UPDATE SET "employeeName" = EXCLUDED."employeeName", "updatedAt" = NOW()`,
      params
    )

    done += chunk.length
    process.stdout.write(`\r  ${done}/${records.length} upserted...`)
  }

  console.log(`\nDone! ${done} slots upserted.`)
  console.log('Locations:', Object.keys(locationCounts).join(', '))

  await pool.end()
}

main().catch(e => { console.error(e); process.exitCode = 1 })
