import { getCollection } from 'astro:content';
import { PROPHET_PROFILES } from '../data/prophets';
import { normalizeEntry, type NormalizedEntry } from './predictionEntry';

export type { NormalizedEntry };

export interface ProphetStat {
  id: string;
  hits: string[];
  misses: string[];
  pending: string[];
  hitCount: number;
  missCount: number;
  pendingCount: number;
  accuracy: number | null;
  verified: number;              // hits + misses
  totalPredictions: number;      // hits + misses + pending
  adjudicationRate: number | null; // verified / totalPredictions × 100, null when 0
  qualified: boolean;            // verified >= QUALIFY_THRESHOLD
  postCount: number;
  postSlugs: string[];
  // new fields — existing fields above are unchanged
  hitEntries: NormalizedEntry[];
  missEntries: NormalizedEntry[];
  lateCount: number;       // misses with verdict === 'late'
  unreasonedCount: number; // hits + misses still as strings or without reason
}

// Minimum verified predictions to appear in the official ranked section
export const QUALIFY_THRESHOLD = 20;

// Wilson score lower bound (95% CI) — used as internal sort key for qualified prophets.
// Favours prophets with genuine accuracy over small-sample flukes.
function wilsonLower(hits: number, verified: number): number {
  if (verified === 0) return 0;
  const z = 1.96;
  const p = hits / verified;
  const n = verified;
  const centre = p + z * z / (2 * n);
  const margin = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return (centre - margin) / (1 + z * z / n);
}

// ── internal helpers ──────────────────────────────────────────────────────────

// Returns raw list elements (string or object) from either Format A or B
function extractRaw(preds: unknown, prophetId: string, key: 'hits' | 'misses' | 'pending'): unknown[] {
  if (!preds || typeof preds !== 'object') return [];
  const p = preds as Record<string, unknown>;
  if (prophetId in p && typeof p[prophetId] === 'object' && !Array.isArray(p[prophetId])) {
    const entry = p[prophetId] as Record<string, unknown>;
    const list = entry[key];
    return Array.isArray(list) ? list : [];
  }
  if ('hits' in p || 'misses' in p || 'pending' in p) {
    const list = p[key];
    return Array.isArray(list) ? list : [];
  }
  return [];
}

// Returns claim strings for Set-based deduplication (unchanged external behaviour)
function extractPreds(preds: unknown, prophetId: string, key: 'hits' | 'misses' | 'pending'): string[] {
  return extractRaw(preds, prophetId, key).map(e => normalizeEntry(e).claim);
}

// Deduplicates by claim string; prefers the richer (reasoned) entry when both exist
function deduplicateEntries(rawEntries: unknown[]): NormalizedEntry[] {
  const map = new Map<string, NormalizedEntry>();
  for (const e of rawEntries) {
    const norm = normalizeEntry(e);
    if (!norm.claim) continue;
    const existing = map.get(norm.claim);
    if (!existing || (!existing.reason && norm.reason)) {
      map.set(norm.claim, norm);
    }
  }
  return [...map.values()];
}

// ── public API ────────────────────────────────────────────────────────────────

let _cache: ProphetStat[] | null = null;

export async function getProphetStats(): Promise<ProphetStat[]> {
  if (_cache) return _cache;

  const allPosts = (await getCollection('blog')).filter(p => !p.data.draft);

  const knownIds = new Set(PROPHET_PROFILES.map(p => p.id));

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
    // Claim strings for dedup (preserves existing Set-based logic exactly)
    const hits    = [...new Set(posts.flatMap(p => extractPreds(p.data.predictions, id, 'hits')))];
    const misses  = [...new Set(posts.flatMap(p => extractPreds(p.data.predictions, id, 'misses')))];
    const pending = [...new Set(posts.flatMap(p => extractPreds(p.data.predictions, id, 'pending')))];

    // Rich entries for display — dedup by claim, prefer reasoned over string
    const hitEntries  = deduplicateEntries(posts.flatMap(p => extractRaw(p.data.predictions, id, 'hits')));
    const missEntries = deduplicateEntries(posts.flatMap(p => extractRaw(p.data.predictions, id, 'misses')));

    const lateCount      = missEntries.filter(e => e.verdict === 'late').length;
    const unreasonedCount = hitEntries.filter(e => !e.reason).length
                          + missEntries.filter(e => !e.reason).length;

    const verified = hits.length + misses.length;
    const totalPredictions = hits.length + misses.length + pending.length;
    const accuracy = verified > 0 ? Math.round((hits.length / verified) * 100) : null;
    const adjudicationRate = totalPredictions > 0
      ? Math.round((verified / totalPredictions) * 100)
      : null;

    stats.push({
      id,
      hits,
      misses,
      pending,
      hitCount:         hits.length,
      missCount:        misses.length,
      pendingCount:     pending.length,
      accuracy,
      verified,
      totalPredictions,
      adjudicationRate,
      qualified:   verified >= QUALIFY_THRESHOLD,
      postCount:   posts.length,
      postSlugs:   posts.map(p => p.id),
      hitEntries,
      missEntries,
      lateCount,
      unreasonedCount,
    });
  }

  stats.sort((a, b) => {
    // Qualified section first, unqualified section after (internal order unchanged)
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    if (a.qualified && b.qualified) {
      // Within qualified: sort by Wilson lower bound (high-sample accuracy beats small-sample fluke)
      const diff = wilsonLower(b.hitCount, b.verified) - wilsonLower(a.hitCount, a.verified);
      if (diff !== 0) return diff;
    }
    // Within unqualified (or Wilson tie): sort by verified count then post count
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
