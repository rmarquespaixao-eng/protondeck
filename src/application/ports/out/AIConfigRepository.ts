export type AIConfigRow = {
  provider: string;
  model: string;
  api_key: string | null;
  base_url: string | null;
  updated_at: string;
};

export interface AIConfigRepository {
  get(): AIConfigRow | undefined;
  set(cfg: { provider: string; model: string; api_key: string | null; base_url: string | null }): void;
}

export interface AICacheRepository {
  get(key: string, ttlMs: number): string | null;
  set(key: string, payload: string): void;
}
