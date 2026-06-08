/**
 * Ping blog aggregator services to announce new/updated content
 */
const SITE_NAME = '兩隻熊的旅遊記事';
const SITE_URL = 'https://twobears.vercel.app';
const FEED_URL = 'https://twobears.vercel.app/rss.xml';

const PING_SERVICES = [
  'http://rpc.pingomatic.com/',
  'http://rpc.weblogs.com/RPC2',
  'http://ping.blogs.yam.com/RPC2',
  'http://ping.blogmura.com/rpc/',
  'http://blogsearch.google.com/ping/RPC2',
  'http://api.feedburner.com/awareness/1.0/ping',
];

const xmlBody = (name, url, feed) => `<?xml version="1.0"?>
<methodCall>
  <methodName>weblogUpdates.extendedPing</methodName>
  <params>
    <param><value><string>${name}</string></value></param>
    <param><value><string>${url}</string></value></param>
    <param><value><string>${url}</string></value></param>
    <param><value><string>${feed}</string></value></param>
  </params>
</methodCall>`;

async function ping(serviceUrl) {
  try {
    const resp = await fetch(serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: xmlBody(SITE_NAME, SITE_URL, FEED_URL),
      signal: AbortSignal.timeout(8000),
    });
    const text = await resp.text();
    const success = text.includes('flerror>0') || text.includes('<boolean>0') || resp.ok;
    console.log(`${success ? '✓' : '✗'} ${serviceUrl} → HTTP ${resp.status}`);
  } catch (err) {
    console.log(`✗ ${serviceUrl} → ${err.message}`);
  }
}

async function main() {
  console.log('Pinging blog services...\n');
  for (const svc of PING_SERVICES) {
    await ping(svc);
  }
  console.log('\nDone!');
}

main();
