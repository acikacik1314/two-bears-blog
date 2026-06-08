import type { APIRoute } from 'astro';
import { put, list } from '@vercel/blob';

const BLOB_KEY = 'friends/profiles.json';

interface Comment {
  id: string;
  text: string;
  time: string;
}

interface Profile {
  id: string;
  nickname: string;
  age: string;
  gender: string;
  location: string;
  interests: string;
  lookingFor: string;
  intro: string;
  contact: string;
  createdAt: string;
  comments: Comment[];
}

function hasStorage() {
  return !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

async function loadProfiles(): Promise<Profile[]> {
  if (!hasStorage()) return [];
  try {
    const { blobs } = await list({ prefix: 'friends/' });
    const blob = blobs.find(b => b.pathname === BLOB_KEY);
    if (!blob) return [];
    const r = await fetch(blob.url);
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

async function saveProfiles(profiles: Profile[]): Promise<boolean> {
  if (!hasStorage()) return false;
  try {
    await put(BLOB_KEY, JSON.stringify(profiles), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
    });
    return true;
  } catch {
    return false;
  }
}

export const GET: APIRoute = async () => {
  const profiles = await loadProfiles();
  return new Response(JSON.stringify(profiles), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'bad json' }), { status: 400 });
  }

  const profiles = await loadProfiles();

  // Adding a comment to existing profile
  if (body.type === 'comment') {
    const { profileId, text } = body;
    if (!profileId || !text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400 });
    }
    const cleaned = text.trim().slice(0, 100);
    if (!cleaned) return new Response(JSON.stringify({ error: 'empty' }), { status: 400 });

    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });

    if (profile.comments.length >= 30) {
      return new Response(JSON.stringify({ error: 'comments full' }), { status: 429 });
    }

    const comment: Comment = {
      id: Date.now().toString(36),
      text: cleaned,
      time: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }),
    };
    profile.comments.push(comment);
    const saved = await saveProfiles(profiles);
    if (!saved) return new Response(JSON.stringify({ ok: true, comment, noStorage: true }));
    return new Response(JSON.stringify({ ok: true, comment }));
  }

  // New profile submission
  const { nickname, age, gender, location, interests, lookingFor, intro, contact } = body;
  if (!nickname || !intro) {
    return new Response(JSON.stringify({ error: 'missing required fields' }), { status: 400 });
  }

  // Rate limit: max 200 profiles total
  if (profiles.length >= 200) {
    return new Response(JSON.stringify({ error: 'board full' }), { status: 429 });
  }

  const clean = (s: string, max: number) => (s ?? '').toString().trim().slice(0, max);

  const profile: Profile = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nickname: clean(nickname, 20),
    age: clean(age, 10),
    gender: clean(gender, 10),
    location: clean(location, 20),
    interests: clean(interests, 80),
    lookingFor: clean(lookingFor, 60),
    intro: clean(intro, 200),
    contact: clean(contact, 60),
    createdAt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }),
    comments: [],
  };

  profiles.unshift(profile); // newest first
  const saved = await saveProfiles(profiles);
  if (!saved) return new Response(JSON.stringify({ ok: false, noStorage: true }));
  return new Response(JSON.stringify({ ok: true, profile }));
};
