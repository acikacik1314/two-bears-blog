import type { APIRoute } from 'astro';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

async function fetchGoogleNews(query: string, lang = 'zh-TW', count = 5): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=TW&ceid=TW:zh-Hant`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const xml = await r.text();

  const items: NewsItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of itemMatches) {
    const block = m[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? block.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? '';
    const link = (block.match(/<link>(.*?)<\/link>/))?.[1]?.trim() ?? '';
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/))?.[1]?.trim() ?? '';
    const source = (block.match(/<source[^>]*>(.*?)<\/source>/))?.[1]?.trim() ?? '';
    if (title && link) items.push({ title, link, pubDate, source });
    if (items.length >= count) break;
  }
  return items;
}

export const GET: APIRoute = async () => {
  const results = await Promise.allSettled([
    fetchGoogleNews('川普 Trump', 'zh-TW', 4),
    fetchGoogleNews('比特幣 Bitcoin BTC', 'zh-TW', 4),
    fetchGoogleNews('預言家 prophecy 末日', 'zh-TW', 4),
  ]);

  const [trump, btc, prophecy] = results.map(r =>
    r.status === 'fulfilled' ? r.value : []
  );

  return new Response(JSON.stringify({ trump, btc, prophecy }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
  });
};
