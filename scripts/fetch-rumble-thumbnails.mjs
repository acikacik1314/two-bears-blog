/**
 * Fetch thumbnail URLs for all Rumble posts via oEmbed and save to frontmatter.
 * Usage: node scripts/fetch-rumble-thumbnails.mjs
 */
import fs from 'fs';
import path from 'path';

const BLOG_DIR = new URL('../src/content/blog/', import.meta.url).pathname;
const CONCURRENCY = 5;

function getRumbleId(content) {
  const m = content.match(/^rumbleId:\s*['"]?([^'"\n]+)['"]?/m);
  return m ? m[1].trim() : null;
}

function hasThumbnail(content) {
  return /^heroImage:/m.test(content);
}

async function fetchThumbnail(rumbleId) {
  const url = `https://rumble.com/api/Media/oembed.json?url=https://rumble.com/embed/${rumbleId}/`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  return data.thumbnail_url || null;
}

function injectHeroImage(content, thumbUrl) {
  // Insert heroImage after the last frontmatter field before closing ---
  // Find the closing --- of frontmatter
  const fmEnd = content.indexOf('\n---\n', 4);
  if (fmEnd === -1) return null;
  const fm = content.slice(0, fmEnd);
  const body = content.slice(fmEnd);
  return fm + `\nheroImage: '${thumbUrl}'` + body;
}

async function processChunk(files) {
  return Promise.all(files.map(async (file) => {
    const filepath = path.join(BLOG_DIR, file);
    const content = fs.readFileSync(filepath, 'utf-8');
    const rumbleId = getRumbleId(content);
    if (!rumbleId) return;
    if (hasThumbnail(content)) {
      process.stdout.write('.');
      return;
    }
    try {
      const thumb = await fetchThumbnail(rumbleId);
      if (!thumb) { process.stdout.write('x'); return; }
      const updated = injectHeroImage(content, thumb);
      if (updated) {
        fs.writeFileSync(filepath, updated, 'utf-8');
        process.stdout.write('✓');
      }
    } catch {
      process.stdout.write('!');
    }
  }));
}

const files = fs.readdirSync(BLOG_DIR).filter(f => f.startsWith('rumble-') && f.endsWith('.md'));
console.log(`Processing ${files.length} Rumble posts...`);

for (let i = 0; i < files.length; i += CONCURRENCY) {
  await processChunk(files.slice(i, i + CONCURRENCY));
}

console.log('\nDone!');
