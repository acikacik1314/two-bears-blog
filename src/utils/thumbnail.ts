import type { CollectionEntry } from 'astro:content';
import { getProphetConfig } from './prophets';

export const CATEGORY_DEFAULT_IMAGES: Record<string, string> = {
  '預言': 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&h=450&fit=crop',
  '影片': 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=800&h=450&fit=crop',
  '旅遊': 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=800&h=450&fit=crop',
  '評測': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&h=450&fit=crop',
  '其他': 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=450&fit=crop',
};

/** Priority: YouTube → prophet avatar → heroImage → fallback */
export function getPostThumbnail(post: CollectionEntry<'blog'>, fallback?: string): string | null {
  if (post.data.youtubeId) return `https://img.youtube.com/vi/${post.data.youtubeId}/hqdefault.jpg`;
  if (post.data.prophet) {
    const key = Array.isArray(post.data.prophet) ? post.data.prophet[0] : post.data.prophet;
    const img = getProphetConfig(key as string).image;
    if (img) return img;
  }
  if (post.data.heroImage) {
    const h = post.data.heroImage as any;
    const url = typeof h === 'string' ? h : h?.src ?? null;
    if (url) return url;
  }
  return fallback ?? null;
}
