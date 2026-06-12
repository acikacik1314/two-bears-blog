export const prerender = false;
import type { APIRoute } from 'astro';

const RSS_URL = 'https://anchor.fm/s/11310a874/podcast/rss';

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

export const GET: APIRoute = async () => {
  try {
    const res = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`RSS fetch ${res.status}`);
    const xml = await res.text();

    const channelPart = xml.split('<item>')[0];
    const coverImage = extractAttr('itunes:image', 'href', channelPart);
    const podcastTitle = extractCdata('title', channelPart);
    const podcastDesc = extractCdata('description', channelPart);

    const itemParts = xml.split('<item>').slice(1);
    const episodes = itemParts.map((item, idx) => {
      const link = extractTag('link', item);
      const slugMatch = link.match(/\/episodes\/([^/\s<]+)/);
      const slug = slugMatch ? slugMatch[1] : '';
      const episodeImage = extractAttr('itunes:image', 'href', item) || coverImage;
      const description = extractCdata('description', item);

      return {
        num: itemParts.length - idx,
        title: extractCdata('title', item),
        date: extractTag('pubDate', item),
        link,
        slug,
        embedUrl: slug
          ? `https://creators.spotify.com/pod/profile/teddy175/embed/episodes/${slug}`
          : '',
        duration: extractTag('itunes:duration', item),
        description,
        image: episodeImage,
      };
    });

    return new Response(JSON.stringify({ coverImage, podcastTitle, podcastDesc, episodes }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
