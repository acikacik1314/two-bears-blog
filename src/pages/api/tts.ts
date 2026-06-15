// src/pages/api/tts.ts
import type { APIRoute } from 'astro';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const prerender = false;

const VOICES: Record<string, { female: string; male: string }> = {
  'ja-JP': { female: 'ja-JP-NanamiNeural', male: 'ja-JP-KeitaNeural' },
  'ko-KR': { female: 'ko-KR-SunHiNeural',  male: 'ko-KR-InJoonNeural' },
  'th-TH': { female: 'th-TH-PremwadeeNeural', male: 'th-TH-NiwatNeural' },
  'vi-VN': { female: 'vi-VN-HoaiMyNeural', male: 'vi-VN-NamMinhNeural' },
  'fr-FR': { female: 'fr-FR-DeniseNeural', male: 'fr-FR-HenriNeural' },
  'it-IT': { female: 'it-IT-ElsaNeural',   male: 'it-IT-DiegoNeural' },
  'es-ES': { female: 'es-ES-ElviraNeural', male: 'es-ES-AlvaroNeural' },
  'de-DE': { female: 'de-DE-KatjaNeural',  male: 'de-DE-ConradNeural' },
  'en-US': { female: 'en-US-JennyNeural',  male: 'en-US-GuyNeural' },
  'id-ID': { female: 'id-ID-GadisNeural',  male: 'id-ID-ArdiNeural' },
  'tr-TR': { female: 'tr-TR-EmelNeural',   male: 'tr-TR-AhmetNeural' },
  'zh-HK': { female: 'zh-HK-HiuMaanNeural', male: 'zh-HK-WanLungNeural' },
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const text   = String(body.text   || '').trim().slice(0, 600);
    const lang   = String(body.lang   || 'ja-JP');
    const gender = String(body.gender || 'female');

    if (!text) return new Response('no text', { status: 400 });

    const voices = VOICES[lang] ?? VOICES['ja-JP'];
    const voice  = gender === 'male' ? voices.male : voices.female;

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const stream = tts.toStream(text);

    const audio = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });

    return new Response(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
