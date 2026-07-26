export interface NormalizedEntry {
  claim: string;
  saidOn?: string;
  window?: string;
  verdict?: 'not-happened' | 'late';
  reason?: string;
  source?: string;
  judgedOn?: string;
}

/**
 * Collapses the string | object union into a single shape.
 * All components read entries only through this function — the union is
 * expanded in exactly one place.
 */
export function normalizeEntry(e: unknown): NormalizedEntry {
  if (typeof e === 'string') return { claim: e };
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>;
    return {
      claim:    String(obj.claim    ?? ''),
      saidOn:   obj.saidOn   as string | undefined,
      window:   obj.window   as string | undefined,
      verdict:  obj.verdict  as 'not-happened' | 'late' | undefined,
      reason:   obj.reason   as string | undefined,
      source:   obj.source   as string | undefined,
      judgedOn: obj.judgedOn as string | undefined,
    };
  }
  return { claim: '' };
}
