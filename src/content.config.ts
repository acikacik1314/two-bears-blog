import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const emptyToUndefined = z.string().optional().transform(v => v === '' ? undefined : v);

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
					hits: z.array(z.string()).optional(),
					misses: z.array(z.string()).optional(),
					pending: z.array(z.string()).optional(),
					excluded: z.array(z.string()).optional(),
				}).strict(),
				// Format B: per-prophet grouping (multi-prophet files)
				// Keys are prophet IDs; values are per-prophet prediction lists
				z.record(z.string(), z.object({
					hits: z.array(z.string()).optional(),
					misses: z.array(z.string()).optional(),
					pending: z.array(z.string()).optional(),
					excluded: z.array(z.string()).optional(),
				}).strict()),
			]).optional(),
		}).superRefine((data, ctx) => {
			// Guard: if predictions uses Format B (per-prophet keys), every key must
			// appear in this file's prophet list. Catches typos like `hit:` that would
			// silently bypass strict() and drop data without an error.
			const preds = data.predictions;
			if (!preds || typeof preds !== 'object') return;
			const FLAT_KEYS = new Set(['hits', 'misses', 'pending', 'excluded']);
			const predKeys = Object.keys(preds);
			const isFormatB = predKeys.some(k => !FLAT_KEYS.has(k));
			if (!isFormatB) return;
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
