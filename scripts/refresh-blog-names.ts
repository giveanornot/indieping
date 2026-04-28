import { getDb } from '../src/db/client.js'
import { initSchema } from '../src/db/schema.js'
import { discoverBlogInfo } from '../src/scanner/fetch.js'
import type { Blog } from '../src/types.js'

initSchema()
const db = getDb()

const blogs = db.prepare(`SELECT * FROM blogs`).all() as Blog[]
console.log(`refreshing names for ${blogs.length} blogs`)

for (const blog of blogs) {
  process.stdout.write(`${blog.domain} ... `)
  const { title } = await discoverBlogInfo(blog.url)
  if (title) {
    db.prepare(`UPDATE blogs SET name = ? WHERE id = ?`).run(title, blog.id)
    console.log(title)
  } else {
    console.log('(no title found, skipped)')
  }
}

console.log('done')
