import { readFile, readdir, writeFile } from 'node:fs/promises'
const files = (await readdir('docs/licenses')).sort()
let text = await readFile('THIRD_PARTY_NOTICES.md', 'utf8')
for (const file of files)
  text += `\n\n${'='.repeat(72)}\n${file}\n${'='.repeat(72)}\n${await readFile(`docs/licenses/${file}`, 'utf8')}`
await writeFile('public/THIRD_PARTY_NOTICES.txt', text)
