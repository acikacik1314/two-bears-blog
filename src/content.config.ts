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
