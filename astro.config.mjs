// @ts-check

import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import keystatic from '@keystatic/astro';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, fontProviders } from 'astro/config';
import { PROPHET_PROFILES } from './src/data/prophets.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** @returns {import('astro').AstroIntegration} */
function validateProphets() {
  return {
    name: 'validate-prophets',
    hooks: {
      'astro:build:start': () => {
        const knownIds = new Set(PROPHET_PROFILES.map(p => p.id));
        const blogDir = resolve('./src/content/blog');
        const files = readdirSync(blogDir).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
        const errors = [];

        for (const file of files) {
          const text = readFileSync(join(blogDir, file), 'utf-8');
          const fmEnd = text.indexOf('---', 3);
          if (!text.startsWith('---') || fmEnd === -1) continue;
          const fm = text.slice(3, fmEnd);

          const line = fm.match(/^prophet:\s*(.+)$/m);
          if (!line) continue;
          const raw = line[1].trim();

          // Parse YAML string ('value') or array (['a','b'])
          const ids = raw.startsWith('[')
            ? (raw.match(/['"]((?:[^'"\\]|\\.)+)['"]/g) ?? []).map(s => s.slice(1, -1))
            : [raw.replace(/^['"]|['"]$/g, '')];

          for (const id of ids) {
            if (id && !knownIds.has(id)) {
              errors.push(`  ${file}: prophet='${id}'`);
            }
          }
        }

        if (errors.length > 0) {
          throw new Error(
            `[validate-prophets] ${errors.length} 篇文章的 prophet 欄位值不在 prophets.ts 名單中，build 中止：\n` +
            errors.join('\n') +
            '\n請確認拼字，或先在 src/data/prophets.ts 新增該預言家的 id。'
          );
        }
      },
    },
  };
}

// https://astro.build/config
export default defineConfig({
	site: 'https://twobears.vercel.app',
	trailingSlash: 'never',
	adapter: vercel(),
	integrations: [mdx(), sitemap({
		filter: (page) => !page.includes('/admin/') && !page.includes('/keystatic/'),
	}), react(), keystatic(), validateProphets()],
	vite: {
		plugins: [tailwindcss()],
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
