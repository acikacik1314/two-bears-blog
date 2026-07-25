/**
 * gen-og-image.mjs
 *
 * 產生 public/og-default.jpg（1200x630），作為首頁與無自訂圖頁面的 og:image。
 * 執行一次即可：node scripts/gen-og-image.mjs
 */

import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')

const W = 1200, H = 630

// ── 1. 縮放品牌 avatar ─────────────────────────────────────────────────────────
const AVATAR_SIZE = 180
const avatar = await sharp(join(ROOT, 'public/images/two-bears-avatar.jpg'))
  .resize(AVATAR_SIZE, AVATAR_SIZE)
  .toBuffer()

// ── 2. SVG 文字 + 裝飾層 ──────────────────────────────────────────────────────
//  字型順序：PingFang TC（macOS）→ Microsoft JhengHei（Win）→ Noto Sans TC → sans-serif
const FONT = "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif"

const svgText = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <!-- 紫色品牌左邊條 -->
  <rect x="0" y="0" width="6" height="${H}" fill="#a855f7"/>

  <!-- 上半淡藍漸層遮罩，讓整體更有層次 -->
  <rect x="0" y="0" width="${W}" height="${H}"
        fill="url(#topglow)" opacity="0.35"/>
  <defs>
    <radialGradient id="topglow" cx="50%" cy="0%" r="80%">
      <stop offset="0%"   stop-color="#312e81"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </radialGradient>
  </defs>

  <!-- 主標題 -->
  <text
    x="${W / 2}" y="300"
    font-family="${FONT}"
    font-size="56" font-weight="900"
    fill="#f1f5f9"
    text-anchor="middle"
    dominant-baseline="middle">
    兩隻熊的旅遊記事｜未來人預言家
  </text>

  <!-- 副標題 -->
  <text
    x="${W / 2}" y="388"
    font-family="${FONT}"
    font-size="30" font-weight="400"
    fill="#a78bfa"
    text-anchor="middle"
    dominant-baseline="middle">
    52 位預言家・命中率誠實記帳
  </text>

  <!-- 底部網域提示 -->
  <text
    x="${W / 2}" y="${H - 36}"
    font-family="${FONT}"
    font-size="20" font-weight="400"
    fill="#475569"
    text-anchor="middle"
    dominant-baseline="middle">
    twobears.vercel.app
  </text>
</svg>`

// ── 3. 合成 ───────────────────────────────────────────────────────────────────
const avatarLeft = Math.round((W - AVATAR_SIZE) / 2)
const avatarTop  = Math.round(H * 0.1)          // 上方 10% 處

await sharp({
  create: { width: W, height: H, channels: 3, background: { r: 15, g: 23, b: 42 } },
})
  .composite([
    { input: Buffer.from(svgText), top: 0, left: 0 },
    { input: avatar, top: avatarTop, left: avatarLeft },
  ])
  .jpeg({ quality: 90, mozjpeg: true })
  .toFile(join(ROOT, 'public/og-default.jpg'))

console.log(`✅ public/og-default.jpg 已產生 (${W}x${H})`)
