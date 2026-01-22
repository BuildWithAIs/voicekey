import fs from 'node:fs'
import path from 'node:path'

const changelogPath = path.join(process.cwd(), 'CHANGELOG.md')

try {
  const content = fs.readFileSync(changelogPath, 'utf8')
  const lines = content.split('\n')

  let capture = false
  const log = []

  // standard-version 的标题格式通常是 "### [1.2.3]..." 或者 "## [1.2.3]..."
  const headerRegex = /^#+ \[?\d+\.\d+\.\d+/

  for (const line of lines) {
    if (headerRegex.test(line)) {
      if (capture) {
        // 遇到了第二个标题，停止捕获
        break
      }
      // 遇到了第一个标题，开始捕获
      capture = true
      continue // 不包含标题行本身（可选，如果你想包含标题就去掉 continue）
    }

    if (capture) {
      log.push(line)
    }
  }

  // 去除首尾空行
  console.log(log.join('\n').trim())
} catch (error) {
  console.error('Error reading CHANGELOG.md:', error)
  process.exit(1)
}
