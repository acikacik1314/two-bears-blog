import { getCollection } from 'astro:content';
import { PROPHET_PROFILES } from '../data/prophets';

export interface ProphetStat {
  id: string;
  hits: string[];
  misses: string[];
  pending: string[];
  hitCount: number;
  missCount: number;
  pendingCount: number;
  accuracy: number | null;
  verified: number;          // hits + misses
  qualified: boolean;        // verified >= QUALIFY_THRESHOLD
  postCount: number;
  postSlugs: string[];
}

// Minimum verified predictions to appear in the official ranked section
export const QUALIFY_THRESHOLD = 5;

let _cache: ProphetStat[] | null = null;

export async function getProphetStats(): Promise<ProphetStat[]> {
  if (_cache) return _cache;

  const allPosts = (await getCollection('blog')).filter(p => !p.data.draft);

  const knownIds = new Set(PROPHET_PROFILES.map(p => p.id));

  // Build index: prophetId → matching posts
  const postsByProphet = new Map<string, typeof allPosts>();
  const unknownEntries: string[] = [];

  for (const post of allPosts) {
    const raw = post.data.prophet;
    if (!raw) continue;
    const ids: string[] = Array.isArray(raw) ? raw : [raw];
    for (const id of ids) {
      const key = id.trim();
      if (!knownIds.has(key)) {
        unknownEntries.push(`  ${post.id}: prophet='${key}'`);
        continue;
      }
      if (!postsByProphet.has(key)) postsByProphet.set(key, []);
      postsByProphet.get(key)!.push(post);
    }
  }

  if (unknownEntries.length > 0) {
    throw new Error(
      `[prophetStats] 以下文章的 prophet 欄位值不在 prophets.ts 名單中，請確認拼字或先在 prophets.ts 新增該預言家：\n` +
      unknownEntries.join('\n')
    );
  }

  const stats: ProphetStat[] = [];

  for (const [id, posts] of postsByProphet) {
    const hits    = [...new Set(posts.flatMap(p => p.data.predictions?.hits    ?? []))];
    const misses  = [...new Set(posts.flatMap(p => p.data.predictions?.misses  ?? []))];
    const pending = [...new Set(posts.flatMap(p => p.data.predictions?.pending ?? []))];
    const verified = hits.length + misses.length;
    const accuracy = verified > 0 ? Math.round((hits.length / verified) * 100) : null;

    stats.push({
      id,
      hits,
      misses,
      pending,
      hitCount:    hits.length,
      missCount:   misses.length,
      pendingCount: pending.length,
      accuracy,
      verified,
      qualified:   verified >= QUALIFY_THRESHOLD,
      postCount:   posts.length,
      postSlugs:   posts.map(p => p.id),
    });
  }

  // Sort: qualified first (by accuracy desc, then by verified desc), then unqualified (by postCount desc)
  stats.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    if (a.accuracy !== null && b.accuracy !== null && a.accuracy !== b.accuracy)
      return b.accuracy - a.accuracy;
    if (a.accuracy !== null && b.accuracy === null) return -1;
    if (a.accuracy === null && b.accuracy !== null) return 1;
    if (a.verified !== b.verified) return b.verified - a.verified;
    return b.postCount - a.postCount;
  });

  _cache = stats;
  return stats;
}

export async function getProphetStat(id: string): Promise<ProphetStat | undefined> {
  const all = await getProphetStats();
  return all.find(s => s.id === id);
}
