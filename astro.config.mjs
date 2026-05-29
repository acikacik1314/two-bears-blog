// @ts-check

import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://twobears.vercel.app',
	adapter: vercel({
		webAnalytics: {
			enabled: true,
		},
	}),
	integrations: [mdx(), sitemap(), react()],
	vite: {
		plugins: [
			{
				name: 'keystatic-config',
				resolveId(id) {
					if (id === 'virtual:keystatic-config') {
						return this.resolve('./keystatic.config.ts');
					}
				},
			},
		],
		optimizeDeps: {
			exclude: ['@keystatic/astro', '@keystatic/core'],
		},
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
