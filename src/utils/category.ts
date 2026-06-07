import type { CollectionEntry } from 'astro:content';

export const CATEGORIES = ['全部', '預言', '影片', '旅遊', '評測'] as const;
export type Category = (typeof CATEGORIES)[number];

const PROPHECY_TAGS = ['預言', '比格斯', '末日', '台海', '三戰', '諾查丹瑪斯', 'Brandon Biggs', '異象', '啟示'];
// Exact tag matches for travel (includes hotel reviews which are travel content)
const TRAVEL_EXACT = new Set(['旅遊分享', '住宿分享', '美食歐伊系', '飯店評測', '泰國', '日本', '韓國', '澳門']);
// Exact tag matches for product reviews
const REVIEW_EXACT = new Set(['家電商品推薦', '開箱文', '商品開箱', '評測']);
// Substring prefixes only used for review (won't accidentally catch 飯店評測)
const REVIEW_PREFIX = ['家電', '耳機', '冰箱', '空調', '洗碗機', '洗衣機', '冷氣'];

export function getPostCategory(post: CollectionEntry<'blog'>): string {
  if (post.data.category) return post.data.category;

  const tags: string[] = post.data.tags ?? [];

  if (post.data.rumbleId || post.data.youtubeId) return '影片';

  if (tags.some(t => PROPHECY_TAGS.some(k => t.includes(k)))) return '預言';

  // Exact match: review first so product reviews with 家電商品推薦 win
  if (tags.some(t => REVIEW_EXACT.has(t))) return '評測';
  if (tags.some(t => REVIEW_PREFIX.some(k => t.startsWith(k)))) return '評測';

  // Exact match: travel
  if (tags.some(t => TRAVEL_EXACT.has(t))) return '旅遊';

  if (post.data.pixnetSource) return '旅遊';

  return '其他';
}

export const CATEGORY_COLORS: Record<string, string> = {
  '預言': '#e74c3c',
  '影片': '#2980b9',
  '旅遊': '#27ae60',
  '評測': '#8e44ad',
  '其他': '#7f8c8d',
};
