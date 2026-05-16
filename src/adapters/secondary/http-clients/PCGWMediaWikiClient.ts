import { timeoutFetch } from '../shared/fetch.js';
import type { PCGWClient } from '../../../ports/PCGWClient.js';
import type { PCGWCacheRepository } from '../../../ports/CacheRepository.js';
import type {
  WidescreenInfo, WidescreenFeatures, SupportState,
} from '../../../domain/pcgw/WidescreenInfo.js';

const CACHE_TTL_OK   = 7 * 24 * 60 * 60 * 1000;
const CACHE_TTL_FAIL = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 12000;

const FEATURE_LABELS: Record<string, keyof WidescreenFeatures> = {
  'Widescreen resolution': 'widescreen',
  'Multi-monitor':         'multimonitor',
  'Ultra-widescreen':      'ultrawidescreen',
  '4K Ultra HD':           '4k',
  'Field of view (FOV)':   'fov',
};

const STATE_MAP: Record<string, SupportState> = {
  'true':     'native',
  'false':    'unsupported',
  'hackable': 'hackable',
  'limited':  'limited',
  'unknown':  'unknown',
};

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVideoTable(html: string): WidescreenFeatures {
  const features: WidescreenFeatures = {};
  const rowRx = /<tr class="template-infotable-body table-settings-video-body-row">[\s\S]*?<th scope="row" class="table-settings-video-body-parameter">[\s\S]*?>([^<]+)<\/(?:abbr|a)>[\s\S]*?<\/th>[\s\S]*?<td class="table-settings-video-body-rating"><div[^>]*class="[^"]*tickcross-(true|false|hackable|limited|unknown)[^"]*"[^>]*><\/div><\/td>[\s\S]*?<td (?:colspan="2" )?class="table-settings-video-body-notes">([\s\S]*?)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRx.exec(html)) !== null) {
    const param = m[1]?.trim();
    const stateRaw = m[2];
    const notesHtml = m[3];
    if (!param || !stateRaw || notesHtml === undefined) continue;
    const key = FEATURE_LABELS[param];
    if (!key) continue;
    features[key] = {
      state: STATE_MAP[stateRaw] ?? 'unknown',
      notes: stripHtml(notesHtml),
    };
  }
  return features;
}

export class PCGWMediaWikiClient implements PCGWClient {
  constructor(private readonly cache: PCGWCacheRepository) {}

  async fetchWidescreenInfo(appid: string, opts: { force?: boolean } = {}): Promise<WidescreenInfo> {
    if (!opts.force) {
      const okCache = this.cache.get(appid, CACHE_TTL_OK);
      if (okCache?.status === 200) {
        try { return JSON.parse(okCache.payload) as WidescreenInfo; } catch { /* */ }
      }
      const failCache = this.cache.get(appid, CACHE_TTL_FAIL);
      if (failCache && failCache.status !== 200) {
        try { return JSON.parse(failCache.payload) as WidescreenInfo; } catch { /* */ }
      }
    }

    const now = new Date().toISOString();
    try {
      const pageName = await this.lookupPageName(appid);
      if (!pageName) {
        const payload: WidescreenInfo = { found: false, features: {}, fetched_at: now, reason: 'jogo não encontrado no PCGamingWiki' };
        this.cache.set(appid, JSON.stringify(payload), 404);
        return payload;
      }

      const pageUrl = `https://www.pcgamingwiki.com/wiki/${pageName.replace(/ /g, '_')}`;
      const apiUrl = `https://www.pcgamingwiki.com/w/api.php?action=parse&page=${encodeURIComponent(pageName)}&prop=text&format=json`;
      const res = await timeoutFetch(apiUrl, { timeoutMs: TIMEOUT_MS });
      if (!res.ok) {
        const payload: WidescreenInfo = { found: false, features: {}, pageUrl, pageName, fetched_at: now, reason: `pcgamingwiki API retornou ${res.status}` };
        this.cache.set(appid, JSON.stringify(payload), res.status);
        return payload;
      }
      const data = await res.json() as { parse?: { text?: { '*': string } }; error?: { info: string } };
      if (data.error) {
        const payload: WidescreenInfo = { found: false, features: {}, pageUrl, pageName, fetched_at: now, reason: data.error.info };
        this.cache.set(appid, JSON.stringify(payload), 404);
        return payload;
      }
      const html = data.parse?.text?.['*'] ?? '';
      const features = parseVideoTable(html);
      const payload: WidescreenInfo = { found: true, pageUrl, pageName, features, fetched_at: now };
      this.cache.set(appid, JSON.stringify(payload), 200);
      return payload;
    } catch (err) {
      const payload: WidescreenInfo = { found: false, features: {}, fetched_at: now, reason: (err as Error).message };
      this.cache.set(appid, JSON.stringify(payload), 500);
      return payload;
    }
  }

  private async lookupPageName(appid: string): Promise<string | null> {
    const url = `https://www.pcgamingwiki.com/w/api.php?action=cargoquery&tables=Infobox_game&fields=_pageName%3DPage&where=Steam_AppID%20HOLDS%20%22${encodeURIComponent(appid)}%22&format=json&limit=1`;
    const res = await timeoutFetch(url, { timeoutMs: TIMEOUT_MS });
    if (!res.ok) return null;
    const data = await res.json() as { cargoquery?: { title: { Page?: string } }[] };
    return data.cargoquery?.[0]?.title?.Page ?? null;
  }
}
