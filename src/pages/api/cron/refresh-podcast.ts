export const prerender = false;
import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { fetchPodcastPayload } from '../../../lib/podcast-fetch';

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization');
  const secret = import.meta.env.CRON_SECRET || process.env.CRON_SECRET || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const payload = await fetchPodcastPayload();
    const { error } = await supabaseAdmin
      .from('podcast_cache')
      .upsert({ id: 1, payload, refreshed_at: new Date().toISOString() });

    if (error) throw error;

    return new Response(
      JSON.stringify({ ok: true, episodes: payload.episodes?.length ?? 0, refreshed_at: new Date().toISOString() }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
