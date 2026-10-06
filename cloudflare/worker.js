// FLUX on Cloudflare: the web client is served as static assets, /api and /ws are forwarded to the FLUX server
// (API_ORIGIN, set in wrangler.jsonc). Everything stays same-origin for the browser, like behind nginx.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
      const target = new URL(env.API_ORIGIN);
      url.protocol = target.protocol;
      url.hostname = target.hostname;
      url.port = target.port;
      const headers = new Headers(request.headers);
      headers.set('Host', target.host);
      return fetch(new Request(url, new Request(request, { headers })));
    }
    return env.ASSETS.fetch(request);
  },
};
