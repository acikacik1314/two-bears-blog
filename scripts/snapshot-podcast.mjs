// Snapshot podcast RSS to a static JSON file for the Cloudflare build.
// Retries 3 times; throws on final failure so the build stops and CF keeps the previous deployment.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const RSS_URL = 'https://anchor.fm/s/11310a874/podcast/rss';
const APPLE_PODCAST_ID = '1896823711';

const extractCdata = (tag, str) => {
  const m = str.match(new RegExp(`<${tag}><\\!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
  return m ? m[1].trim() : '';
};
const extractTag = (tag, str) => {
  const m = str.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : '';
};
const extractAttr = (tag, attr, str) => {
  const m = str.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`));
  return m ? m[1] : '';
};
const normalizeTitle = (t) => {
  if (!t) return '';
  return t.trim()
    .replace(/\s+/g, '')
    .replace(/[「」『』【】〔〕《》〈〉""'']/g, '')
    .replace(/[！？。，、；：…‥～〜·・]/g, '')
    .replace(/[!?.,;:~]/g, '')
    .toLowerCase();
};

async function fetchFromItunes() {
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${APPLE_PODCAST_ID}&entity=podcastEpisode&limit=200&country=TW`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return { exact: {}, norm: {} };
    const data = await res.json();
    const exact = {}, norm = {};
    for (const r of data.results ?? []) {
      if (r.wrapperType === 'podcastEpisode' && r.trackId && r.trackName) {
        const id = String(r.trackId);
        exact[r.trackName.trim()] = id;
        norm[normalizeTitle(r.trackName)] = id;
      }
    }
    return { exact, norm };
  } catch { return { exact: {}, norm: {} }; }
}

function findEpisodeId(title, itunes) {
  if (itunes.exact[title]) return itunes.exact[title];
  const n = normalizeTitle(title);
  if (!n) return '';
  return itunes.norm[n] || '';
}

async function fetchOnce() {
  const [rssRes, itunes] = await Promise.all([
    fetch(RSS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)' },
      signal: AbortSignal.timeout(15000),
    }),
    fetchFromItunes(),
  ]);
  if (!rssRes.ok) throw new Error(`RSS fetch failed: ${rssRes.status}`);
  const xml = await rssRes.text();

  const channelPart = xml.split('<item>')[0];
  const coverImage = extractAttr('itunes:image', 'href', channelPart);
  const podcastTitle = extractCdata('title', channelPart);
  const podcastDesc = extractCdata('description', channelPart);

  const itemParts = xml.split('<item>').slice(1);
  if (itemParts.length === 0) throw new Error('RSS had zero episodes');

  const episodes = itemParts.map((item, idx) => {
    const title = extractCdata('title', item);
    const appleId = findEpisodeId(title, itunes);
    const linkUrl = extractTag('link', item);
    const slugMatch = linkUrl.match(/\/episodes\/([^/\s?]+)/);
    const spotifyEmbedUrl = slugMatch
      ? `https://creators.spotify.com/pod/profile/teddy175/embed/episodes/${slugMatch[1]}`
      : '';
    return {
      num: itemParts.length - idx,
      title,
      date: extractTag('pubDate', item),
      appleUrl: appleId
        ? `https://podcasts.apple.com/tw/podcast/id${APPLE_PODCAST_ID}?i=${appleId}`
        : `https://podcasts.apple.com/tw/podcast/id${APPLE_PODCAST_ID}`,
      hasEpisodeId: !!appleId,
      spotifyEmbedUrl,
      duration: extractTag('itunes:duration', item),
      description: extractCdata('description', item),
      image: extractAttr('itunes:image', 'href', item) || coverImage,
    };
  });

  return { coverImage, podcastTitle, podcastDesc, episodes };
}

export async function snapshotPodcast(distDir = 'dist') {
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const payload = await fetchOnce();
      const apiDir = resolve(distDir, 'api');
      mkdirSync(apiDir, { recursive: true });
      writeFileSync(resolve(apiDir, 'podcast-rss'), JSON.stringify(payload), 'utf-8');
      console.log(`[snapshot-podcast] OK: ${payload.episodes.length} episodes (attempt ${i})`);
      return payload.episodes.length;
    } catch (e) {
      lastErr = e;
      console.warn(`[snapshot-podcast] attempt ${i} failed: ${e.message}`);
      if (i < 3) await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`[snapshot-podcast] all 3 attempts failed: ${lastErr?.message}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  snapshotPodcast().catch(e => { console.error(e); process.exit(1); });
}
