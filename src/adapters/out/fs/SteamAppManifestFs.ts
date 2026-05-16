import { readFile, readdir, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstalledGamesReader } from '../../../application/ports/out/InstalledGamesReader.js';
import type { InstalledGame } from '../../../domain/games/SteamLibrary.js';

const LIBRARY_FOLDERS_CANDIDATES = [
  join(homedir(), '.steam/steam/config/libraryfolders.vdf'),
  join(homedir(), '.local/share/Steam/config/libraryfolders.vdf'),
];

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function readSteamLibraryPaths(): Promise<string[]> {
  for (const candidate of LIBRARY_FOLDERS_CANDIDATES) {
    if (!await exists(candidate)) continue;
    const content = await readFile(candidate, 'utf8');
    const paths: string[] = [];
    const re = /"path"\s+"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) paths.push(m[1]!);
    return paths;
  }
  return [];
}

export class SteamAppManifestFs implements InstalledGamesReader {
  async listInstalled(): Promise<InstalledGame[]> {
    const out: InstalledGame[] = [];
    const libraries = await readSteamLibraryPaths();
    for (const lib of libraries) {
      const steamappsDir = join(lib, 'steamapps');
      if (!await exists(steamappsDir)) continue;
      let entries: string[];
      try {
        entries = await readdir(steamappsDir);
      } catch {
        continue;
      }
      for (const f of entries) {
        if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
        let content: string;
        try {
          content = await readFile(join(steamappsDir, f), 'utf8');
        } catch {
          continue;
        }
        const appid = content.match(/"appid"\s+"(\d+)"/)?.[1];
        const name = content.match(/"name"\s+"([^"]+)"/)?.[1];
        const installdir = content.match(/"installdir"\s+"([^"]+)"/)?.[1];
        if (!appid || !name) continue;
        out.push({
          appid,
          name,
          install_path: installdir ? join(steamappsDir, 'common', installdir) : null,
        });
      }
    }
    return out;
  }
}
