import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ProtonDBCommunityClient } from '../../../ports/ProtonDBCommunityClient.js';
import type { CommunityData, ProtonReport } from '../../../domain/check/ProtonReport.js';

const TTL = 6 * 60 * 60 * 1000;

export class ProtonDBCommunityHttpClient implements ProtonDBCommunityClient {
  constructor(private readonly cacheDir: string) {
    mkdirSync(cacheDir, { recursive: true });
  }

  async fetchReports(appid: string, limit = 10): Promise<CommunityData> {
    const cacheFile = join(this.cacheDir, `reports-${appid}.json`);
    if (existsSync(cacheFile) && Date.now() - statSync(cacheFile).mtimeMs < TTL) {
      return JSON.parse(readFileSync(cacheFile, 'utf8')) as CommunityData;
    }
    const url = `https://www.protondb.com/api/v1/reports/search?appid=${appid}&page=0&sort=date`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'ProtonDeck/0.1 (homelab)' },
    });
    if (!res.ok) throw new Error(`ProtonDB HTTP ${res.status}`);
    const raw = await res.json() as { reports?: ProtonReport[]; total?: number };
    const reports = (raw.reports ?? []).slice(0, limit).map(r => ({
      timestamp: r.timestamp ?? 0,
      notes: r.notes ?? '',
      rating: r.rating ?? 'unknown',
      protonVersion: r.protonVersion ?? '',
      os: r.os ?? '',
      gpu: r.gpu ?? '',
      gpuDriver: r.gpuDriver ?? '',
      systemRam: r.systemRam ?? 0,
    }));
    const out: CommunityData = {
      appid,
      fetched_at: new Date().toISOString(),
      total: raw.total ?? reports.length,
      reports,
    };
    writeFileSync(cacheFile, JSON.stringify(out, null, 2));
    return out;
  }
}
