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

const isCloudflare = process.env.PUBLIC_DEPLOY_TARGET === 'cloudflare';

function buildSitemapExclusions() {
  const blogDir = resolve('./src/content/blog');
  const files = readdirSync(blogDir).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
  const thinSlugs = new Set();
  const categoryCounts = {};
  const prophetCounts = {};
  for (const file of files) {
    const text = readFileSync(join(blogDir, file), 'utf-8');
    if (!text.startsWith('---')) continue;
    const fmEnd = text.indexOf('\n---', 3);
    if (fmEnd === -1) continue;
    const fm = text.slice(3, fmEnd);
    if (/^draft:\s*true/m.test(fm)) continue;
    const slug = file.replace(/\.mdx?$/, '');
    if (/^thin:\s*true/m.test(fm)) thinSlugs.add(slug);
    const catMatch = fm.match(/^category:[ \t]*(.+)$/m);
    const cat = catMatch ? catMatch[1].trim().replace(/^['"]|['"]$/g, '') : '';
    if (cat) categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    const propLine = fm.match(/^prophet:[ \t]*(.+)$/m);
    if (propLine) {
      const raw = propLine[1].trim();
      const ids = raw.startsWith('[')
        ? (raw.match(/['"]((?:[^'"\\]|\\.)+)['"]/g) ?? []).map(s => s.slice(1, -1))
        : [raw.replace(/^['"]|['"]$/g, '')];
      for (const id of ids) if (id) prophetCounts[id] = (prophetCounts[id] ?? 0) + 1;
    }
  }
  const sparseCategories = new Set(Object.entries(categoryCounts).filter(([, n]) => n < 3).map(([c]) => c));
  const sparseProphets = new Set(Object.entries(prophetCounts).filter(([, n]) => n < 3).map(([id]) => id));
  return { thinSlugs, sparseCategories, sparseProphets };
}

const { thinSlugs, sparseCategories, sparseProphets } = buildSitemapExclusions();

function sitemapFilter(page) {
  if (page.includes('/admin/') || page.includes('/keystatic/') || page.includes('/tools/')) return false;
  let u;
  try { u = new URL(page); } catch { return true; }
  const path = u.pathname.replace(/\/$/, '');
  // /blog/<slug> — exclude thin
  const blogSlug = path.match(/^\/blog\/([^/]+)$/);
  if (blogSlug && thinSlugs.has(decodeURIComponent(blogSlug[1]))) return false;
  // /blog/<n> paginated listing — exclude page >= 2
  const blogPage = path.match(/^\/blog\/(\d+)$/);
  if (blogPage && Number(blogPage[1]) >= 2) return false;
  // /category/<cat> or /category/<cat>/<n> — exclude sparse or page >= 2
  const cat = path.match(/^\/category\/([^/]+)(?:\/(\d+))?$/);
  if (cat) {
    const catName = decodeURIComponent(cat[1]);
    const pageNum = cat[2] ? Number(cat[2]) : 1;
    if (pageNum >= 2) return false;
    if (sparseCategories.has(catName)) return false;
  }
  // /prophet/<id> — exclude sparse
  const prophet = path.match(/^\/prophet\/([^/]+)$/);
  if (prophet && sparseProphets.has(decodeURIComponent(prophet[1]))) return false;
  // /transcript/* already noindex, keep out of sitemap
  if (path.startsWith('/transcript/')) return false;
  return true;
}

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

          const line = fm.match(/^prophet:[ \t]*(.+)$/m);
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
	...(isCloudflare ? {} : { adapter: vercel() }),
	integrations: [
		mdx(),
		sitemap({ filter: sitemapFilter }),
		react(),
		...(isCloudflare ? [] : [keystatic()]),
		validateProphets(),
	],
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
