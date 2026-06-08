import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  try {
    const url =
      'https://earthquake.usgs.gov/fdsnws/event/1/query?' +
      'format=geojson&minlatitude=21.5&maxlatitude=26.5' +
      '&minlongitude=119.3&maxlongitude=122.5&minmagnitude=3.5' +
      '&orderby=time&limit=8';
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const quakes = (d.features ?? []).map((f: any) => ({
      mag: f.properties.mag,
      place: f.properties.place,
      time: f.properties.time,
      depth: Math.round(f.geometry?.coordinates?.[2] ?? 0),
    }));
    return new Response(JSON.stringify(quakes), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch {
    return new Response('[]', {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
