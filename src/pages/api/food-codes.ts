export const prerender = false;

import type { APIRoute } from 'astro';
import codesData from '../../data/food-codes.json';

export interface CodeEntry {
  code: string;
  desc: string;
  expires?: string | null;
}

export interface PlatformCodes {
  new: CodeEntry[];
  existing: CodeEntry[];
}

export interface FoodCodesResult {
  ubereats: PlatformCodes;
  foodpanda: PlatformCodes;
  fetched: string;
  source: string;
}

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(codesData satisfies FoodCodesResult), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
