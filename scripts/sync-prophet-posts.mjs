/**
 * sync-prophet-posts.mjs
 *
 * Reads markdown script files from ~/Downloads/未來人預言家/
 * Converts each new file into a blog post via Groq AI
 * Saves to src/content/blog/
 *
 * Usage: node scripts/sync-prophet-posts.mjs
 * Or:    npm run sync:prophets
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOG_DIR    = join(__dirname, '../src/content/blog');
const SOURCE_DIR  = join(homedir(), 'Downloads/未來人預言家');
const SYNCED_FILE = join(__dirname, 'synced-prophet-posts.json');

// ── Groq key loader ──────────────────────────────────────────────────────────
function getGroqKeys() {
  const keysFile = join(homedir(), '.claude/api_keys.json');
  try {
    const raw = JSON.parse(readFileSync(keysFile, 'utf-8'));
    const keys = raw.groq;
    if (Array.isArray(keys) && keys.length) return keys;
    if (typeof keys === 'string') return [keys];
  } catch {}
  if (process.env.GROQ_API_KEY) return [process.env.GROQ_API_KEY];
  if (process.env.GROQ_API_KEYS) {
    try { return JSON.parse(process.env.GROQ_API_KEYS); } catch {}
  }
  return [];
}

// ── Groq call ────────────────────────────────────────────────────────────────
async function callGroq(messages, jsonMode = false) {
  const keys   = getGroqKeys();
  const models = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant'];
  if (!keys.length) throw new Error('No Groq API keys found');

  for (const model of models) {
    for (const key of keys) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 2500,
            temperature: 0.72,
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
        });
        if (!res.ok) {
          if (res.status === 429) continue;
          const err = await res.text();
          console.warn(`  Groq ${model}: ${res.status} ${err.slice(0,80)}`);
          continue;
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      } catch (e) {
        console.warn(`  Groq error: ${e.message}`);
      }
    }
  }
  throw new Error('All Groq models/keys failed');
}

// ── Filename parser ───────────────────────────────────────────────────────────
function parseFilename(filename) {
  // Pattern: Prophet_Name_YYYYMMDD-YYYYMMDD_YYYYMMDD_HHMMSS.md
  const base  = basename(filename, '.md');
  const parts = base.split('_');

  // Find "YYYYMMDD-YYYYMMDD" date-range segment
  let dateRangeIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (/^\d{8}-\d{8}$/.test(parts[i])) { dateRangeIdx = i; break; }
  }

  const prophetParts = dateRangeIdx > 0 ? parts.slice(0, dateRangeIdx) : parts.slice(0, -2);
  const prophetName  = prophetParts.join(' ');

  let pubDate = new Date().toISOString().slice(0, 10);
  if (dateRangeIdx >= 0) {
    const endRaw = parts[dateRangeIdx].split('-')[1];
    pubDate = `${endRaw.slice(0,4)}-${endRaw.slice(4,6)}-${endRaw.slice(6,8)}`;
  }

  return { prophetName, pubDate };
}

// ── Synced-file tracking ──────────────────────────────────────────────────────
function getSynced() {
  if (!existsSync(SYNCED_FILE)) return {};
  return JSON.parse(readFileSync(SYNCED_FILE, 'utf-8'));
}
function markSynced(filename, slug) {
  const s = getSynced();
  s[filename] = { slug, syncedAt: new Date().toISOString() };
  writeFileSync(SYNCED_FILE, JSON.stringify(s, null, 2));
}

// ── Hero images (curated Unsplash) ───────────────────────────────────────────
const HERO_IMAGES = {
  default:   'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=800&h=450&fit=crop',
  war:       'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=800&h=450&fit=crop',
  space:     'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=800&h=450&fit=crop',
  mystical:  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&h=450&fit=crop',
  globe:     'https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=800&h=450&fit=crop',
  lightning: 'https://images.unsplash.com/photo-1505672678657-cc7037095e60?w=800&h=450&fit=crop',
};

// ── Convert one file ──────────────────────────────────────────────────────────
async function convertPost(filename) {
  const raw = readFileSync(join(SOURCE_DIR, filename), 'utf-8');
  const { prophetName, pubDate } = parseFilename(filename);

  // Trim long files to avoid token limits
  const content = raw.length > 5000 ? raw.slice(0, 5000) + '\n\n[...內容已截斷]' : raw;

  console.log(`\n🔄 Converting: ${filename}`);
  console.log(`   Prophet: ${prophetName} | Date: ${pubDate}`);

  const heroOptions = Object.values(HERO_IMAGES).join('\n');

  const prompt = `你是台灣科技媒體部落格編輯，專門報導神秘學與末日預言。

以下是一份 Podcast 腳本原稿（預言家：${prophetName}）：

${content}

請根據此腳本生成一篇繁體中文部落格文章，以 JSON 格式回傳（不要有任何其他文字）：

{
  "slug": "英文 slug，小寫，用連字號，描述主題，例如 mcmoneagle-ww3-collapse-2026（不要包含prophet名字太多次，30字元以內）",
  "title": "從腳本的「標題設計｜3 個選項」中選最吸引人的一個，或根據內容重新生成更好的（繁體中文，20字以內，包含數字或關鍵懸念）",
  "description": "SEO摘要，2句話說明核心預言（繁體中文，60字以內）",
  "tags": ["預言", "相關標籤陣列，3-5個"],
  "heroImage": "從以下選一個最符合主題的圖片URL：\n${heroOptions}",
  "body": "以第三人稱新聞報導風格撰寫的繁體中文部落格文章，markdown 格式，約 600-800 字。包含：開場引言、預言家背景介紹、各預言重點（關鍵預言用**粗體**標示）、結語。不使用 # 標題符號，改用粗體段落標題。刪除所有「（過場）」標記。"
}`;

  const result = await callGroq([{ role: 'user', content: prompt }], true);

  let parsed;
  try {
    parsed = JSON.parse(result);
  } catch {
    // Try extracting JSON from the text
    const m = result.match(/\{[\s\S]+\}/);
    if (!m) throw new Error('AI response is not valid JSON');
    parsed = JSON.parse(m[0]);
  }

  const { slug, title, description, tags, heroImage, body } = parsed;

  if (!slug || !title || !body) throw new Error('AI response missing required fields');

  // Auto-detect prophet from prophet name in filename
  const prophetFromName = (() => {
    const n = prophetName.toLowerCase();
    if (/biggs|brandon/i.test(n)) return '比格斯';
    if (/parker|craig/i.test(n)) return '帕克';
    if (/mcmoneagle|joe/i.test(n)) return '麥克蒙尼格';
    if (/morphee|摩普萊/i.test(n)) return '摩普萊';
    if (/polish|波蘭/i.test(n)) return '波蘭預言家';
    return null;
  })();

  // Ensure slug is unique
  let finalSlug = slug.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 50);
  let slugPath  = join(BLOG_DIR, `${finalSlug}.md`);
  if (existsSync(slugPath)) {
    // Add date suffix to make unique
    finalSlug = `${finalSlug}-${pubDate.replace(/-/g, '')}`;
    slugPath   = join(BLOG_DIR, `${finalSlug}.md`);
  }

  const safeTitle = title.replace(/'/g, "''");
  const safeDesc  = description.replace(/'/g, "''");
  const tagsYaml  = JSON.stringify(tags || ['預言']);

  const prophetLine = prophetFromName ? `\nprophet: '${prophetFromName}'` : '';

  const mdContent = `---
title: '${safeTitle}'
description: '${safeDesc}'
pubDate: '${pubDate}'
tags: ${tagsYaml}
heroImage: '${heroImage || HERO_IMAGES.default}'${prophetLine}
---

${body.trim()}
`;

  writeFileSync(slugPath, mdContent, 'utf-8');
  console.log(`   ✅ Saved → src/content/blog/${finalSlug}.md`);
  return finalSlug;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes('--all');

  if (!existsSync(SOURCE_DIR)) {
    console.error(`❌ Source folder not found: ${SOURCE_DIR}`);
    console.error(`   Create it or put your .md files in ~/Downloads/未來人預言家/`);
    process.exit(1);
  }

  const synced = getSynced();
  const allFiles = readdirSync(SOURCE_DIR)
    .filter(f => f.endsWith('.md'))
    .sort(); // oldest first

  const toSync = forceAll ? allFiles : allFiles.filter(f => !synced[f]);

  if (toSync.length === 0) {
    console.log('✅ Nothing new to sync.');
    console.log(`Already synced (${Object.keys(synced).length} files):`);
    Object.entries(synced).forEach(([f, v]) => console.log(`  • ${f} → ${v.slug}`));
    return;
  }

  console.log(`📋 Found ${toSync.length} new file(s) to sync:`);
  toSync.forEach(f => console.log(`  • ${f}`));

  const results = [];
  for (const file of toSync) {
    try {
      const slug = await convertPost(file);
      markSynced(file, slug);
      results.push({ file, slug, ok: true });
    } catch (e) {
      console.error(`  ❌ Failed: ${e.message}`);
      results.push({ file, ok: false, error: e.message });
    }
    // Small delay to avoid Groq rate limits
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n── Summary ──────────────────────────────────');
  results.forEach(r => {
    if (r.ok) console.log(`  ✅ ${r.file} → ${r.slug}`);
    else      console.log(`  ❌ ${r.file}: ${r.error}`);
  });

  const succeeded = results.filter(r => r.ok).length;
  if (succeeded > 0) {
    console.log(`\n🚀 ${succeeded} post(s) created. Run to deploy:`);
    console.log('   npm run build && vercel deploy --prod');
  }
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
