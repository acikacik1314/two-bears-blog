export const prerender = false;
import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabase';
import { fetchPodcastPayload } from '../../lib/podcast-fetch';

const CACHE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 小時

export const GET: APIRoute = async () => {
  try {
    // 1. 先查 Supabase 快取
    const { data: cache } = await supabaseAdmin
      .from('podcast_cache')
      .select('payload, refreshed_at')
      .eq('id', 1)
      .maybeSingle();

    if (cache) {
      const ageMs = Date.now() - new Date(cache.refreshed_at).getTime();
      if (ageMs < CACHE_MAX_AGE_MS) {
        return new Response(JSON.stringify(cache.payload), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
    }

    // 2. 快取失效或不存在：即時抓 RSS
    const payload = await fetchPodcastPayload();

    // 寫回快取（fire-and-forget，不阻塞回傳）
    supabaseAdmin
      .from('podcast_cache')
      .upsert({ id: 1, payload, refreshed_at: new Date().toISOString() })
      .then(() => {}).catch(() => {});

    return new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
