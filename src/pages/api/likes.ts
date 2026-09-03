export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabase';

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// GET ?slug=xxx → { count: n }
// GET            → { slug: count, ... }
export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug');

  if (slug) {
    const { data, error } = await supabaseAdmin
      .from('post_likes')
      .select('count')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.error('[likes] GET failed:', error.message);
    }
    return json({ count: data?.count ?? 0 });
  }

  const { data, error } = await supabaseAdmin
    .from('post_likes')
    .select('slug, count');

  if (error) {
    console.error('[likes] GET all failed:', error.message);
    return json({});
  }

  const store: Record<string, number> = {};
  for (const row of data ?? []) store[row.slug] = row.count;
  return json(store);
};

// POST { slug }: 原子的に +1、失敗は 503 で明示する
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { slug?: string };
    const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
    if (!slug) return new Response('Bad Request', { status: 400 });

    const { data, error } = await supabaseAdmin.rpc('increment_like', { p_slug: slug });

    if (error) {
      console.error('[likes] increment_like failed:', error.message);
      return json({ ok: false, error: error.message }, 503);
    }

    return json({ ok: true, count: data as number });
  } catch (e) {
    console.error('[likes] unexpected error:', e);
    return new Response('Server Error', { status: 500 });
  }
};
