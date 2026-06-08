import { parse } from 'node-html-parser';
import fs from 'fs';
import path from 'path';

const BLOG_DIR = new URL('../src/content/blog/', import.meta.url).pathname;

// Posts to re-scrape (have predictions: frontmatter + pixnetSource)
const POSTS = [
  '2020-06-29-future-person-kfk-2060.md',
  '2020-08-18-future-person-2ch-2062.md',
  '2020-09-19-omnec-onec-venus-prophecy.md',
  '2020-10-11-future-person-yj2075.md',
  '2020-10-13-future-person-adi-2062v.md',
  '2020-11-03-hamilton-parker-2020.md',
  '2022-02-24-judy-hevenly-2022.md',
  '2022-02-24-hamilton-parker-2022.md',
];

function htmlToMarkdown(node) {
  if (node.nodeType === 3) {
    // Text node
    return node.rawText;
  }

  const tag = node.tagName ? node.tagName.toLowerCase() : null;
  const children = node.childNodes || [];

  const innerMd = () => children.map(htmlToMarkdown).join('');

  if (!tag) return innerMd();

  switch (tag) {
    case 'p':
    case 'div': {
      const inner = innerMd().trim();
      return inner ? '\n\n' + inner : '';
    }
    case 'br':
      return '\n';
    case 'strong':
    case 'b': {
      const inner = innerMd().trim();
      return inner ? `**${inner}**` : '';
    }
    case 'em':
    case 'i': {
      const inner = innerMd().trim();
      return inner ? `*${inner}*` : '';
    }
    case 'h1':
      return '\n\n# ' + innerMd().trim();
    case 'h2':
      return '\n\n## ' + innerMd().trim();
    case 'h3':
      return '\n\n### ' + innerMd().trim();
    case 'h4':
      return '\n\n#### ' + innerMd().trim();
    case 'img': {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || '';
      if (!src) return '';
      // Skip tracking pixels (tiny images)
      if (src.includes('1x1') || src.includes('pixel') || src.includes('tracking')) return '';
      return `\n\n![${alt}](${src})`;
    }
    case 'a': {
      const href = node.getAttribute('href') || '';
      const inner = innerMd().trim();
      if (!inner) return '';
      if (!href || href === '#') return inner;
      // Don't linkify if it's just an image wrapper
      if (inner.startsWith('![')) return inner;
      return `[${inner}](${href})`;
    }
    case 'ul': {
      const items = children
        .filter(c => c.tagName && c.tagName.toLowerCase() === 'li')
        .map(li => '- ' + li.childNodes.map(htmlToMarkdown).join('').trim())
        .join('\n');
      return items ? '\n\n' + items : '';
    }
    case 'ol': {
      let idx = 1;
      const items = children
        .filter(c => c.tagName && c.tagName.toLowerCase() === 'li')
        .map(li => `${idx++}. ` + li.childNodes.map(htmlToMarkdown).join('').trim())
        .join('\n');
      return items ? '\n\n' + items : '';
    }
    case 'li':
      return '\n- ' + innerMd().trim();
    case 'blockquote': {
      const inner = innerMd().trim();
      return inner ? '\n\n> ' + inner.replace(/\n/g, '\n> ') : '';
    }
    case 'hr':
      return '\n\n---';
    case 'span':
      return innerMd();
    case 'table':
    case 'tbody':
    case 'thead':
    case 'tr':
    case 'td':
    case 'th':
      return innerMd();
    case 'script':
    case 'style':
    case 'noscript':
    case 'iframe':
      return '';
    default:
      return innerMd();
  }
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { frontmatter: '', body: content };
  return {
    frontmatter: match[0],
    body: content.slice(match[0].length),
  };
}

async function fetchPixnetContent(url) {
  console.log(`  Fetching: ${url}`);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }

  const html = await resp.text();

  // Try to find the article content
  const root = parse(html);

  // Try multiple selectors Pixnet uses
  const selectors = [
    '.article-content-inner',
    '#article-content-inner',
    '.article-content',
    '[data-testid="article-content"]',
    '.post-content',
  ];

  let contentNode = null;
  for (const sel of selectors) {
    contentNode = root.querySelector(sel);
    if (contentNode) {
      console.log(`  Found content with selector: ${sel}`);
      break;
    }
  }

  if (!contentNode) {
    // Try to find any large text block
    console.log('  WARNING: Could not find article-content-inner, trying body content...');
    // Save raw HTML for debugging
    fs.writeFileSync(`/tmp/pixnet-debug-${Date.now()}.html`, html);
    console.log(`  Saved debug HTML to /tmp/`);
    return null;
  }

  // Convert to markdown
  let md = htmlToMarkdown(contentNode);

  // Clean up
  md = md
    // Normalize multiple blank lines to max 2
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading/trailing whitespace
    .trim()
    // Fix images that got extra spaces
    .replace(/!\[\s*\]/g, '![)')
    // Remove Pixnet tracking/badge images
    .replace(/!\[.*?\]\(https?:\/\/[\w.]*pixnet[\w./]*\)/g, '')
    .replace(/!\[.*?\]\(https?:\/\/s3\.1px\.tw\/blog\/common\/[^)]*\)/g, '')
    // Remove empty lines between consecutive images
    .replace(/\)\n\n!\[/g, ')\n\n![');

  return md;
}

async function processPost(filename) {
  const filepath = path.join(BLOG_DIR, filename);
  const content = fs.readFileSync(filepath, 'utf-8');
  const { frontmatter, body } = extractFrontmatter(content);

  // Extract pixnetSource URL
  const urlMatch = frontmatter.match(/pixnetSource:\s*'([^']+)'/);
  if (!urlMatch) {
    console.log(`  SKIP: No pixnetSource in ${filename}`);
    return false;
  }

  const pixnetUrl = urlMatch[1];

  try {
    const newBody = await fetchPixnetContent(pixnetUrl);
    if (!newBody) {
      console.log(`  FAIL: Could not extract content for ${filename}`);
      return false;
    }

    // Add disclaimer at end if not present
    const disclaimer = '\n\n**（以上言論不代表本部落格立場，文章內容純粹轉載網路蒐集資料）**';
    const bodyWithDisclaimer = newBody.includes('不代表本部落格立場')
      ? newBody
      : newBody + disclaimer;

    const newContent = frontmatter + bodyWithDisclaimer + '\n';
    fs.writeFileSync(filepath, newContent, 'utf-8');
    console.log(`  OK: Wrote ${newContent.length} chars to ${filename}`);
    return true;
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return false;
  }
}

async function main() {
  const target = process.argv[2];
  const posts = target ? [target] : POSTS;

  console.log(`Re-scraping ${posts.length} posts from Pixnet...\n`);
  let ok = 0, fail = 0;

  for (const post of posts) {
    console.log(`Processing: ${post}`);
    const success = await processPost(post);
    if (success) ok++; else fail++;
    // Small delay to be polite
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\nDone: ${ok} success, ${fail} failed`);
}

main().catch(console.error);
