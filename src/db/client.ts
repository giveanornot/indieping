import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '../../data/blogs.db')

let instance: Database.Database | null = null

export function getDb(): Database.Database {
  if (!instance) {
    mkdirSync(dirname(DB_PATH), { recursive: true })
    instance = new Database(DB_PATH)
    instance.pragma('journal_mode = WAL')
    instance.pragma('foreign_keys = ON')
  }
  return instance
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ;(async () => {
    const { initSchema } = await import('./schema.js')
    initSchema()
    console.log('DB initialized at', DB_PATH)
    getDb().close()
  })()
}
