/**
 * Submit all blog post URLs to IndexNow (notifies Bing + Yandex instantly)
 * Usage: node scripts/submit-indexnow.mjs
 */
import fs from 'fs';
import path from 'path';

const SITE = 'https://twobears.vercel.app';
const KEY = '729e1576b7654d8e87386e3b0eea9a98';
const BLOG_DIR = new URL('../src/content/blog/', import.meta.url).pathname;

function getSlug(filename) {
  return filename.replace(/\.mdx?$/, '');
}

function getFrontmatterField(content, field) {
  const m = content.match(new RegExp(`^${field}:\\s*['\"]?([^'\"\\n]+)['\"]?`, 'm'));
  return m ? m[1].trim() : null;
}

async function main() {
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));

  const urls = files.map(f => {
    const slug = getSlug(f);
    return `${SITE}/blog/${slug}/`;
  });

  // Add main pages
  urls.unshift(SITE + '/');
  urls.unshift(SITE + '/blog/');
  urls.unshift(SITE + '/podcast/');
  urls.unshift(SITE + '/about/');

  console.log(`Submitting ${urls.length} URLs to IndexNow...`);

  // Submit in batches of 100
  const BATCH = 100;
  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    const body = {
      host: 'twobears.vercel.app',
      key: KEY,
      keyLocation: `${SITE}/${KEY}.txt`,
      urlList: batch,
    };

    const resp = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });

    console.log(`Batch ${Math.floor(i/BATCH)+1}: HTTP ${resp.status} (${batch.length} URLs)`);
    if (resp.status !== 200 && resp.status !== 202) {
      const text = await resp.text();
      console.log('Response:', text);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\nDone! Bing and Yandex will index your site shortly.');
}

main().catch(console.error);
