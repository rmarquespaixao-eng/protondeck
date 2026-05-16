export type CacheRow = {
  payload: string;
  fetched_at: string;
  status: number;
};

export interface PCGWCacheRepository {
  get(appid: string, ttlMs: number): CacheRow | null;
  set(appid: string, payload: string, status: number): void;
}

export interface ExternalCacheRepository {
  get(scope: string, key: string, ttlMs: number): CacheRow | null;
  set(scope: string, key: string, payload: string, status: number): void;
}
