export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabase';

// GET: slug→count の Map を返す（index.astro のスコアリングに使用）
export const GET: APIRoute = async () => {
  const { data, error } = await supabaseAdmin
    .from('post_views')
    .select('slug, count');

  if (error) {
    console.error('[view] GET failed:', error.message);
    return new Response(JSON.stringify({}), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.slug] = row.count;

  return new Response(JSON.stringify(counts), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300',
    },
  });
};

// POST { slug }: 原子的に +1、失敗は 503 で明示する
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
    if (!slug) return new Response('Bad Request', { status: 400 });

    const { data, error } = await supabaseAdmin.rpc('increment_view', { p_slug: slug });

    if (error) {
      console.error('[view] increment_view failed:', error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ views: data as number }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[view] unexpected error:', e);
    return new Response('Server Error', { status: 500 });
  }
};
