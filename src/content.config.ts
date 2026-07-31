import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const emptyToUndefined = z.string().optional().transform(v => v === '' ? undefined : v);

// Pending items: string (legacy) or lightweight object with claim + saidOn
const PendingEntry = z.union([
  z.string(),
  z.object({
    claim:  z.string(),
    saidOn: z.string().optional(),
    window: z.string().optional(),
  }).strict(),
]);

// Hits/misses: same base, plus verdict/reason/source/judgedOn (reason mandatory)
const PredictionEntry = z.union([
  z.string(),
  z.object({
    claim:    z.string(),
    saidOn:   z.string().optional(),
    window:   z.string().optional(),
    verdict:  z.enum(['not-happened', 'late']).optional(),
    reason:   z.string(),             // mandatory when using object form
    source:   z.string().optional(),
    judgedOn: z.string().optional(),
  }).strict(),
]);

const DATE_RE = /\d{4}[-年]/;

function checkHitsMisses(
  preds: Record<string, unknown>,
  ctx: z.RefinementCtx,
  pathPrefix: string[],
) {
  for (const listName of ['hits', 'misses'] as const) {
    const list = preds[listName];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (typeof entry !== 'object' || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      const claim20 = String(obj.claim ?? '').slice(0, 20);
      const reason  = String(obj.reason ?? '').trim();

      if (!reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...pathPrefix, listName],
          message: `${listName} 物件條目缺少 reason：「${claim20}」`,
        });
        continue;
      }
      if (!DATE_RE.test(reason)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...pathPrefix, listName],
          message: `${listName} reason 必須含年份（\\d{4}[-年]）：「${claim20}」`,
        });
      }
      if (listName === 'misses' && !obj.verdict) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...pathPrefix, listName],
          message: `misses 物件條目必須有 verdict：「${claim20}」`,
        });
      }
    }
  }
}

const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema: () =>
		z.object({
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: emptyToUndefined,
			category: z.string().optional(),
			tags: z.array(z.string()).optional(),
			youtubePost: emptyToUndefined,
			rumbleId: z.string().optional(),
			rumblePage: emptyToUndefined,
			youtubeId: z.string().optional(),
			pixnetSource: emptyToUndefined,
			prophet: z.union([z.string(), z.array(z.string())]).optional(),
			draft: z.boolean().optional(),
		predictions: z.union([
				// Format A: flat list (single prophet, or genuinely shared predictions)
				z.object({
					hits:     z.array(PredictionEntry).optional(),
					misses:   z.array(PredictionEntry).optional(),
					pending:  z.array(PendingEntry).optional(),
					excluded: z.array(z.string()).optional(),
				}).strict(),
				// Format B: per-prophet grouping (multi-prophet files)
				z.record(z.string(), z.object({
					hits:     z.array(PredictionEntry).optional(),
					misses:   z.array(PredictionEntry).optional(),
					pending:  z.array(PendingEntry).optional(),
					excluded: z.array(z.string()).optional(),
				}).strict()),
			]).optional(),
		}).superRefine((data, ctx) => {
			// ── existing guard: Format B keys must appear in prophet list ────────
			const preds = data.predictions;
			if (!preds || typeof preds !== 'object') return;
			const FLAT_KEYS = new Set(['hits', 'misses', 'pending', 'excluded']);
			const predKeys = Object.keys(preds);
			const isFormatB = predKeys.some(k => !FLAT_KEYS.has(k));

			if (isFormatB) {
				const prophetList = Array.isArray(data.prophet)
					? data.prophet
					: data.prophet ? [data.prophet] : [];
				const prophetSet = new Set(prophetList);
				for (const key of predKeys) {
					if (!prophetSet.has(key)) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: ['predictions', key],
							message: `predictions key "${key}" is not in prophet list [${prophetList.join(', ')}] — typo or missing prophet?`,
						});
					}
				}
			}

			// ── new: validate object-form entries in hits/misses ─────────────────
			if (!isFormatB) {
				checkHitsMisses(preds as Record<string, unknown>, ctx, ['predictions']);
			} else {
				for (const prophetKey of predKeys) {
					const prophetPreds = (preds as Record<string, unknown>)[prophetKey];
					if (prophetPreds && typeof prophetPreds === 'object') {
						checkHitsMisses(
							prophetPreds as Record<string, unknown>,
							ctx,
							['predictions', prophetKey],
						);
					}
				}
			}
		}),
});

const about = defineCollection({
	loader: glob({ base: './src/content/singletons', pattern: 'about.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		youtubeUrl: z.string().optional(),
	}),
});

export const collections = { blog, about };
