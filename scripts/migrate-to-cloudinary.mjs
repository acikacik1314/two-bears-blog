import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

cloudinary.config({
  cloud_name: 'dxnu4ceop',
  api_key: '413919488719673',
  api_secret: 'cYpMPGABrNYTR4hfgBKprb15-j8',
});

const BLOG_DIR = 'src/content/blog';
const PROGRESS_FILE = 'scripts/.cloudinary-progress.json';
const CONCURRENCY = 10;
const TEST_MODE = process.argv.includes('--test'); // 只跑前 10 張

// 載入已完成的進度
let done = {};
if (fs.existsSync(PROGRESS_FILE)) {
  done = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
}
const saveProgress = () => fs.writeFileSync(PROGRESS_FILE, JSON.stringify(done));

// 從所有 md 收集唯一 pimg URL
const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
const allUrls = new Set();
for (const f of files) {
  const content = fs.readFileSync(path.join(BLOG_DIR, f), 'utf-8');
  const matches = content.match(/https?:\/\/[^\s"')\]]*pimg[^\s"')\]]*/g) || [];
  matches.forEach(u => allUrls.add(u));
}

let pending = [...allUrls].filter(u => !done[u]);
if (TEST_MODE) pending = pending.slice(0, 10);

console.log(`總計：${allUrls.size} 張 | 已完成：${allUrls.size - pending.length} | 待上傳：${pending.length}${TEST_MODE ? ' (測試模式)' : ''}`);
if (pending.length === 0) { console.log('全部完成！'); process.exit(0); }

// 上傳單張
let success = 0, failed = 0;
async function uploadOne(url) {
  const cleanUrl = url.split('?')[0];
  // pic.pimg.tw/acikacik/filename.jpg → blog/acikacik/filename (without ext)
  const public_id = 'blog/' + cleanUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\.[^.]+$/, '');

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await cloudinary.uploader.upload(url, {
        public_id,
        overwrite: false,
        resource_type: 'image',
      });
      done[url] = res.secure_url;
      success++;
      return;
    } catch (err) {
      // 圖片已存在 → 直接記錄 URL
      if (err.error?.message?.includes('already exists') || err.message?.includes('already exists')) {
        done[url] = `https://res.cloudinary.com/dxnu4ceop/image/upload/${public_id}.jpg`;
        success++;
        return;
      }
      if (attempt === 2) {
        failed++;
        console.error(`❌ ${path.basename(cleanUrl)} - ${err.message}`);
      }
    }
  }
}

// 分批並行上傳
let processed = 0;
for (let i = 0; i < pending.length; i += CONCURRENCY) {
  const batch = pending.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(uploadOne));
  processed += batch.length;

  // 每 100 張存一次進度
  if (processed % 100 === 0 || i + CONCURRENCY >= pending.length) {
    saveProgress();
    const pct = Math.round((processed / pending.length) * 100);
    console.log(`進度 ${pct}% | ${processed}/${pending.length} | 成功：${success} 失敗：${failed}`);
  }
}

saveProgress();

// 更新 markdown 檔案
console.log('\n更新 Markdown 檔案中...');
let updatedFiles = 0;
for (const f of files) {
  const filepath = path.join(BLOG_DIR, f);
  let content = fs.readFileSync(filepath, 'utf-8');
  let changed = false;
  for (const [oldUrl, newUrl] of Object.entries(done)) {
    if (content.includes(oldUrl)) {
      content = content.replaceAll(oldUrl, newUrl);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filepath, content);
    updatedFiles++;
    if (TEST_MODE) console.log(`  ✏️  ${f}`);
  }
}

console.log(`\n✅ 完成！成功：${success} 失敗：${failed} 更新檔案：${updatedFiles} 篇`);
