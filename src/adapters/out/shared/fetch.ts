export const DEFAULT_USER_AGENT = 'ProtonDeck/0.1 (homelab, single-user)';

export function timeoutFetch(url: string, opts: { timeoutMs: number; headers?: Record<string, string>; init?: RequestInit } = { timeoutMs: 12000 }): Promise<Response> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('fetch timeout')), opts.timeoutMs);
    fetch(url, {
      ...opts.init,
      headers: { 'User-Agent': DEFAULT_USER_AGENT, ...(opts.headers ?? {}) },
    }).then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}
