export type ProtonLogResult =
  | { found: false; reason: 'missing' | 'empty'; checked_path: string }
  | { found: true; path: string; size: number; mtime: string; excerpt: string; truncated: boolean; lines: number };

export interface ProtonLogReader {
  read(appid: string): ProtonLogResult;
}
