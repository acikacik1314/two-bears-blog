export const prerender = false;
import type { APIRoute } from 'astro';

const RSS_URL = 'https://anchor.fm/s/11310a874/podcast/rss';
const APPLE_PODCAST_ID = '1896823711';

function extractCdata(tag: string, str: string) {
  const m = str.match(new RegExp(`<${tag}><\\!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
  return m ? m[1].trim() : '';
}
function extractTag(tag: string, str: string) {
  const m = str.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : '';
}
function extractAttr(tag: string, attr: string, str: string) {
  const m = str.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`));
  return m ? m[1] : '';
}

function normalizeTitle(t: string): string {
  if (!t) return '';
  return t.trim()
    .replace(/\s+/g, '')
    .replace(/[「」『』【】〔〕《》〈〉""'']/g, '')
    .replace(/[！？。，、；：…‥～〜·・]/g, '')
    .replace(/[!?.,;:~]/g, '')
    .toLowerCase();
}

// iTunes Search API — 覆蓋所有舊集數，但新集有幾小時延遲
async function fetchFromItunes(): Promise<{ exact: Record<string, string>; norm: Record<string, string> }> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${APPLE_PODCAST_ID}&entity=podcastEpisode&limit=200&country=TW`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return { exact: {}, norm: {} };
    const data = await res.json();
    const exact: Record<string, string> = {};
    const norm: Record<string, string> = {};
    for (const r of data.results ?? []) {
      if (r.wrapperType === 'podcastEpisode' && r.trackId && r.trackName) {
        const id = String(r.trackId);
        exact[r.trackName.trim()] = id;
        norm[normalizeTitle(r.trackName)] = id;
      }
    }
    return { exact, norm };
  } catch {
    return { exact: {}, norm: {} };
  }
}

// Jina.ai 渲染 Apple Podcasts 頁面 — 和 App 同步，即時覆蓋最新幾集
async function fetchFromWebPage(): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `https://r.jina.ai/https://podcasts.apple.com/tw/podcast/id${APPLE_PODCAST_ID}`,
      {
        headers: { 'Accept': 'text/plain', 'X-Timeout': '15' },
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) return {};
    const text = await res.text();

    // Jina 渲染格式：[時間 ### 標題 簡介](url?i=EPISODE_ID)
    const linkRegex = /\[([^\]]+)\]\([^)]*[?&]i=(\d+)[^)]*\)/g;
    const normMap: Record<string, string> = {};
    let m;
    while ((m = linkRegex.exec(text)) !== null) {
      const linkText = m[1];
      const episodeId = m[2];
      const afterHash = linkText.match(/###\s+(.+)/);
      if (afterHash) {
        normMap[normalizeTitle(afterHash[1])] = episodeId;
      }
    }
    return normMap;
  } catch {
    return {};
  }
}

function findEpisodeId(
  title: string,
  itunes: { exact: Record<string, string>; norm: Record<string, string> },
  webNorm: Record<string, string>
): string {
  if (itunes.exact[title]) return itunes.exact[title];

  const n = normalizeTitle(title);
  if (!n) return '';

  if (itunes.norm[n]) return itunes.norm[n];

  // Jina 的 key 是「標題+簡介」整段，用 startsWith 比對
  for (const [key, id] of Object.entries(webNorm)) {
    if (key.startsWith(n) && n.length > 5) return id;
  }

  return '';
}

export const GET: APIRoute = async () => {
  try {
    const [rssRes, itunes, webNorm] = await Promise.all([
      fetch(RSS_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)' },
        signal: AbortSignal.timeout(12000),
      }),
      fetchFromItunes(),
      fetchFromWebPage(),
    ]);

    if (!rssRes.ok) throw new Error(`RSS fetch ${rssRes.status}`);
    const xml = await rssRes.text();

    const channelPart = xml.split('<item>')[0];
    const coverImage = extractAttr('itunes:image', 'href', channelPart);
    const podcastTitle = extractCdata('title', channelPart);
    const podcastDesc = extractCdata('description', channelPart);

    const itemParts = xml.split('<item>').slice(1);
    const episodes = itemParts.map((item, idx) => {
      const title = extractCdata('title', item);
      const appleId = findEpisodeId(title, itunes, webNorm);
      const description = extractCdata('description', item);

      return {
        num: itemParts.length - idx,
        title,
        date: extractTag('pubDate', item),
        embedUrl: appleId
          ? `https://embed.podcasts.apple.com/tw/podcast/id${APPLE_PODCAST_ID}?i=${appleId}`
          : '',
        audioUrl: extractAttr('enclosure', 'url', item),
        duration: extractTag('itunes:duration', item),
        description,
        image: extractAttr('itunes:image', 'href', item) || coverImage,
      };
    });

    return new Response(JSON.stringify({ coverImage, podcastTitle, podcastDesc, episodes }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
