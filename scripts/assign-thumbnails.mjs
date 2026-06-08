/**
 * Assign thematic thumbnails to posts that have none.
 * Strategy: use curated Unsplash photos per category + title-based hash for consistency.
 * Usage: node scripts/assign-thumbnails.mjs
 */
import fs from 'fs';
import path from 'path';

const BLOG_DIR = new URL('../src/content/blog/', import.meta.url).pathname;

// Curated Unsplash photo pools per category (stable CDN URLs)
const PHOTO_POOLS = {
  '預言': [
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=450&fit=crop', // Earth from space
    'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=800&h=450&fit=crop', // Galaxy
    'https://images.unsplash.com/photo-1534447677793-b5ab6b0a0a12?w=800&h=450&fit=crop', // Storm clouds
    'https://images.unsplash.com/photo-1462524500090-89b35d895cf6?w=800&h=450&fit=crop', // Moon
    'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&h=450&fit=crop', // Stars
    'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=800&h=450&fit=crop', // Aurora
  ],
  '旅遊': [
    'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&h=450&fit=crop', // Airplane
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&h=450&fit=crop', // Landscape
    'https://images.unsplash.com/photo-1503220317375-aaad61436b1b?w=800&h=450&fit=crop', // Travel road
    'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=450&fit=crop', // Bali travel
    'https://images.unsplash.com/photo-1514214246423-baf33a18af0a?w=800&h=450&fit=crop', // Night city
    'https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?w=800&h=450&fit=crop', // Hotel pool
  ],
  '評測': [
    'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=800&h=450&fit=crop', // Tech gadgets
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&h=450&fit=crop', // Headphones
    'https://images.unsplash.com/photo-1526406915894-7bcd65f60845?w=800&h=450&fit=crop', // Kitchen
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&h=450&fit=crop', // Home appliance
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&h=450&fit=crop', // Tech desk
    'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=800&h=450&fit=crop', // Product review
  ],
  '影片': [
    'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&h=450&fit=crop', // Video camera
    'https://images.unsplash.com/photo-1536240478700-b869ad10e128?w=800&h=450&fit=crop', // Filming
    'https://images.unsplash.com/photo-1524253482453-3fed8d2fe12b?w=800&h=450&fit=crop', // YouTube creator
    'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&h=450&fit=crop', // Screen content
    'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&h=450&fit=crop', // Movie/video
  ],
  '其他': [
    'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=450&fit=crop', // Writing/blog
    'https://images.unsplash.com/photo-1432821596592-e2c18b78144f?w=800&h=450&fit=crop', // Writing desk
    'https://images.unsplash.com/photo-1471107340929-a87cd0f5b5f3?w=800&h=450&fit=crop', // Coffee & laptop
    'https://images.unsplash.com/photo-1484100356142-db6ab6244067?w=800&h=450&fit=crop', // Reading
  ],
};

// Consistent hash from string
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function getCategory(content) {
  const m = content.match(/^category:\s*['"]?([^'"\n]+)['"]?/m);
  if (m) return m[1].trim();
  const tags = (content.match(/^tags:\s*\[([^\]]+)\]/m)?.[1] || '').toLowerCase();
  if (tags.includes('預言') || tags.includes('比格斯') || tags.includes('末日')) return '預言';
  if (tags.includes('旅遊') || tags.includes('飯店') || tags.includes('住宿')) return '旅遊';
  if (tags.includes('開箱') || tags.includes('評測') || tags.includes('家電')) return '評測';
  if (/^rumbleId:|^youtubeId:/m.test(content)) return '影片';
  return '其他';
}

function getTitle(content) {
  const m = content.match(/^title:\s*['"]?([^'"\n]+)['"]?/m);
  return m ? m[1].trim() : '';
}

function hasThumb(content) {
  return /^heroImage:/m.test(content) || /^youtubeId:/m.test(content);
}

function insertHeroImage(content, url) {
  const fmEnd = content.indexOf('\n---\n', 4);
  if (fmEnd === -1) return null;
  return content.slice(0, fmEnd) + `\nheroImage: '${url}'` + content.slice(fmEnd);
}

const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
let updated = 0;

for (const file of files) {
  const filepath = path.join(BLOG_DIR, file);
  const content = fs.readFileSync(filepath, 'utf-8');

  if (hasThumb(content)) continue;

  const cat = getCategory(content);
  const title = getTitle(content);
  const pool = PHOTO_POOLS[cat] ?? PHOTO_POOLS['其他'];
  const idx = hashStr(file + title) % pool.length;
  const imageUrl = pool[idx];

  const updated_content = insertHeroImage(content, imageUrl);
  if (updated_content) {
    fs.writeFileSync(filepath, updated_content, 'utf-8');
    updated++;
    console.log(`✓ ${cat.padEnd(4)} ${file.slice(0, 50)}`);
  }
}

console.log(`\nDone: ${updated} posts updated`);
