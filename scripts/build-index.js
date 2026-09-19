// 扫描 articles/*.md，生成 articles/index.json（含标题/日期/分类/摘要/字数）
// 零依赖，只用 Node 内置模块：node scripts/build-index.js
// 列表页只需请求这一份 JSON，不必再逐篇下载正文；漏登记、写错顺序的问题也随之消失。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ARTICLES_DIR = path.join(ROOT, 'articles');
const OUTPUT = path.join(ARTICLES_DIR, 'index.json');

// 剥离行内 Markdown 语法，供摘要展示纯文本（与 index.html 的 stripMarkdown 保持一致）
function stripMarkdown(text) {
  return text
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)([^*_]*)\1/g, '$2')
    .replace(/(\*|_)([^*_]*)\1/g, '$2')
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^([-*+]|\d+\.)\s+/, '');
}

function parseArticle(text, filename) {
  const lines = text.split('\n');
  let title = filename.replace(/\.md$/, '');
  let date = '';
  let category = '';
  let contentStart = 0;

  // 标题：第一个 # 开头的行
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^#\s+(.+)/);
    if (match) {
      title = match[1].trim();
      contentStart = i + 1;
      break;
    }
  }

  // 元数据：标题后 5 行内的 > 日期： / > 分类：
  for (let i = contentStart; i < Math.min(contentStart + 5, lines.length); i++) {
    const line = lines[i].trim();
    const dateMatch = line.match(/^>\s*日期[：:]\s*(.+)/);
    const catMatch = line.match(/^>\s*分类[：:]\s*(.+)/);
    if (dateMatch) date = dateMatch[1].trim();
    if (catMatch) category = catMatch[1].trim();
  }

  // 摘要：逐行剥离 Markdown 后取正文前 150 字
  let textContent = '';
  let inCode = false;
  for (let i = contentStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (!line || inCode || line.startsWith('>') || line.startsWith('#') || line.startsWith('!')) continue;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line) || line.startsWith('|')) continue;
    textContent += stripMarkdown(line) + ' ';
    if (textContent.length > 150) break;
  }
  textContent = textContent.trim();
  const summary = textContent.substring(0, 150) + (textContent.length > 150 ? '...' : '');

  // 正文非空白字符数，作为中文内容的近似字数
  const wordCount = lines
    .slice(contentStart)
    .filter(line => !line.trim().match(/^>\s*(日期|分类)[：:]/))
    .join(' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[\s#>*`_~\-+]/g, '')
    .length;

  if (!date) {
    const now = new Date();
    date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }

  return { file: filename, title, date, category, summary, wordCount };
}

function timestamp(dateStr) {
  const m = String(dateStr || '').match(/(\d{4})\s*[-/\u5e74]?\s*(\d{1,2})\s*[-/\u6708]?\s*(\d{1,2})/);
  if (!m) return 0;
  return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
}

function main() {
  if (!fs.existsSync(ARTICLES_DIR)) {
    console.error('articles 目录不存在：' + ARTICLES_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(ARTICLES_DIR).filter(name => name.toLowerCase().endsWith('.md'));
  const articles = files
    .map(name => parseArticle(fs.readFileSync(path.join(ARTICLES_DIR, name), 'utf8'), name))
    .sort((a, b) => timestamp(b.date) - timestamp(a.date) || a.file.localeCompare(b.file));

  const payload = { generated: Date.now(), articles };
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log('已写入 ' + path.relative(ROOT, OUTPUT) + '，共 ' + articles.length + ' 篇：');
  for (const a of articles) {
    console.log('  ' + a.date + '  ' + (a.category || '-') + '  ' + a.title);
  }
}

main();
