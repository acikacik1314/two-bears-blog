// Cloudflare Pages middleware: handle bulk redirects that exceed the free _redirects 100-rule cap.
// The REDIRECT_MAP is generated at build time by scripts/gen-cf-redirects.mjs from vercel.json.
import REDIRECT_MAP from './redirect-map.json';

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const key = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const target = REDIRECT_MAP[key];
  if (target) {
    return Response.redirect(new URL(target, url), 301);
  }
  return context.next();
};
