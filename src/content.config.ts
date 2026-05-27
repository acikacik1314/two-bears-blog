import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

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
			predictions: z.object({
				hits: z.array(z.string()).optional(),
				misses: z.array(z.string()).optional(),
				pending: z.array(z.string()).optional(),
			}).optional(),
		}),
});

export const collections = { blog };
