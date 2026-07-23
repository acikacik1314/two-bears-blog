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

async function fetchFromWebPage(): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `https://r.jina.ai/https://podcasts.apple.com/tw/podcast/id${APPLE_PODCAST_ID}`,
      {
        headers: { 'Accept': 'text/plain', 'X-Timeout': '4' },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) return {};
    const text = await res.text();
    const linkRegex = /\[([^\]]+)\]\([^)]*[?&]i=(\d+)[^)]*\)/g;
    const normMap: Record<string, string> = {};
    let m;
    while ((m = linkRegex.exec(text)) !== null) {
      const afterHash = m[1].match(/###\s+(.+)/);
      if (afterHash) normMap[normalizeTitle(afterHash[1])] = m[2];
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
  for (const [key, id] of Object.entries(webNorm)) {
    if (key.startsWith(n) && n.length > 5) return id;
  }
  return '';
}

const EMPTY_ITUNES = { exact: {} as Record<string, string>, norm: {} as Record<string, string> };

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>(res => setTimeout(() => res(fallback), ms))]);
}

export async function fetchPodcastPayload() {
  const enrichPromise = Promise.all([
    withTimeout(fetchFromItunes(), 3000, EMPTY_ITUNES),
    withTimeout(fetchFromWebPage(), 3000, {} as Record<string, string>),
  ]);

  const [rssRes, [itunes, webNorm]] = await Promise.all([
    fetch(RSS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)' },
      signal: AbortSignal.timeout(10000),
    }),
    enrichPromise,
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
      description,
      image: extractAttr('itunes:image', 'href', item) || coverImage,
    };
  });

  return { coverImage, podcastTitle, podcastDesc, episodes };
}
