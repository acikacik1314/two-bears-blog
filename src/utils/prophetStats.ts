import { getCollection } from 'astro:content';
import { PROPHET_PROFILES } from '../data/prophets';
import { normalizeEntry, type NormalizedEntry } from './predictionEntry';

export type { NormalizedEntry };

export interface ProphetStat {
  id: string;
  hits: string[];
  misses: string[];
  pending: string[];
  hitCount: number;              // ALL labeled hits (including unreasoned)
  missCount: number;
  pendingCount: number;
  reasonedHitCount: number;      // hits with non-empty reason (counts for scoring)
  accuracy: number | null;       // reasonedHitCount / verified; null if verified < MIN_SAMPLE_FOR_PCT
  verified: number;              // reasonedHitCount + missCount (evidence-gated)
  totalPredictions: number;      // hitCount + missCount + pendingCount
  adjudicationRate: number | null; // verified / totalPredictions × 100, null when 0
  qualified: boolean;            // verified >= QUALIFY_THRESHOLD
  postCount: number;
  postSlugs: string[];
  hitEntries: NormalizedEntry[];
  missEntries: NormalizedEntry[];
  lateCount: number;       // misses with verdict === 'late'
  unreasonedCount: number; // hits without reason (not yet evidence-gated)
}

// Minimum verified predictions to appear in the official ranked section
export const QUALIFY_THRESHOLD = 15;

// Minimum verified predictions required to show an accuracy percentage.
// Below this threshold, show raw "X/Y" score instead of "Z%" to avoid
// statistically meaningless single-digit sample claims.
export const MIN_SAMPLE_FOR_PCT = 5;

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

// Strips trailing parenthetical annotation used as editorial notes:
// e.g. （文中確認命中）, （應驗：2026年…）, (already verified)
function normalizeKey(claim: string): string {
  return claim.replace(/[（(][^）)]*[）)]\s*$/, '').trim();
}

// Levenshtein-based similarity in [0,1]. O(|a|·|b|) using single-row DP.
function strSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const dp = Array.from({ length: la + 1 }, (_, i) => i);
  for (let j = 1; j <= lb; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= la; i++) {
      const tmp = dp[i];
      dp[i] = b[j - 1] === a[i - 1] ? prev : Math.min(prev, dp[i], dp[i - 1]) + 1;
      prev = tmp;
    }
  }
  return 1 - dp[la] / Math.max(la, lb);
}

// Two-phase dedup:
// Phase 1 — exact normalized-key grouping (O(n)), strips trailing parentheticals.
// Phase 2 — fuzzy merge between group representatives (O(m²), m << n),
//            merges entries whose normalized keys are ≥ 0.85 similar.
// Within each merged group, prefers the reasoned entry over a plain string.
function deduplicateEntries(rawEntries: unknown[]): NormalizedEntry[] {
  // Phase 1: exact normalized key
  const byKey = new Map<string, NormalizedEntry>();
  for (const e of rawEntries) {
    const norm = normalizeEntry(e);
    if (!norm.claim) continue;
    const key = normalizeKey(norm.claim);
    const existing = byKey.get(key);
    if (!existing || (!existing.reason && norm.reason)) {
      byKey.set(key, norm);
    }
  }

  // Phase 2: fuzzy merge remaining group representatives
  const keys = [...byKey.keys()];
  const absorbed = new Set<string>();
  for (let i = 0; i < keys.length; i++) {
    if (absorbed.has(keys[i])) continue;
    for (let j = i + 1; j < keys.length; j++) {
      if (absorbed.has(keys[j])) continue;
      if (strSimilarity(keys[i], keys[j]) >= 0.85) {
        const ei = byKey.get(keys[i])!;
        const ej = byKey.get(keys[j])!;
        if (!ei.reason && ej.reason) byKey.set(keys[i], ej);
        absorbed.add(keys[j]);
        byKey.delete(keys[j]);
      }
    }
  }

  return [...byKey.values()];
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
    // Single dedup pass: normalized-key + fuzzy merge + prefer-reasoned.
    // hits/misses/pending arrays derive from the same result to keep count consistent.
    const hitEntries  = deduplicateEntries(posts.flatMap(p => extractRaw(p.data.predictions, id, 'hits')));
    const missEntries = deduplicateEntries(posts.flatMap(p => extractRaw(p.data.predictions, id, 'misses')));
    const pendingEntries = deduplicateEntries(
      posts.flatMap(p => extractRaw(p.data.predictions, id, 'pending'))
    );

    const hits    = hitEntries.map(e => e.claim);
    const misses  = missEntries.map(e => e.claim);
    const pending = pendingEntries.map(e => e.claim);

    const lateCount       = missEntries.filter(e => e.verdict === 'late').length;
    const unreasonedCount = hitEntries.filter(e => !e.reason).length;

    // Only hits with a non-empty reason count toward the accuracy score.
    // Unreasoned hits are visible in the record but treated as pending evidence.
    const reasonedHitCount = hitEntries.filter(e => e.reason && e.reason.trim()).length;

    // verified = evidence-gated: only reasoned hits + all misses
    // (misses are self-evident: "event didn't happen by deadline")
    const verified        = reasonedHitCount + misses.length;
    const totalPredictions = hits.length + misses.length + pending.length;

    // Only show a percentage when the sample is large enough to be meaningful
    const accuracy = verified >= MIN_SAMPLE_FOR_PCT
      ? Math.round((reasonedHitCount / verified) * 100)
      : null;

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
      reasonedHitCount,
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
