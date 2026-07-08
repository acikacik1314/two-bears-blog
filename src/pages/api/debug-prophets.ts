export const prerender = false;

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const allPosts = await getCollection('blog');
  const prophetPosts = allPosts.filter(p => !p.data.draft && p.data.prophet);
  
  const byProphet: Record<string, string[]> = {};
  for (const post of prophetPosts) {
    const raw = post.data.prophet;
    const ids: string[] = Array.isArray(raw) ? raw : [raw!];
    for (const id of ids) {
      if (!byProphet[id]) byProphet[id] = [];
      byProphet[id].push(post.id);
    }
  }

  const summary: Record<string, number> = {};
  for (const [k, v] of Object.entries(byProphet)) {
    summary[k] = v.length;
  }

  return new Response(JSON.stringify({
    totalPosts: allPosts.length,
    prophetPostCount: prophetPosts.length,
    byProphet: summary,
    allProphetPostIds: prophetPosts.map(p => p.id).sort(),
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};
