/**
 * Parser/writer minimalista do VDF do Steam.
 * Funcoes puras — sem I/O.
 */

/** Encontra { e } que delimitam o bloco do appid em UserLocalConfigStore.Software.Valve.Steam.apps. */
export function findAppBlockBoundaries(content: string, appid: string): { open: number; close: number } | null {
  const keyToken = `"${appid}"`;
  let searchFrom = 0;
  while (searchFrom < content.length) {
    const keyIdx = content.indexOf(keyToken, searchFrom);
    if (keyIdx < 0) return null;
    let i = keyIdx + keyToken.length;
    while (i < content.length && /\s/.test(content[i] ?? '')) i++;
    if (content[i] !== '{') { searchFrom = keyIdx + 1; continue; }
    const open = i;
    let depth = 1;
    i = open + 1;
    while (i < content.length && depth > 0) {
      const ch = content[i];
      if (ch === '"') {
        i++;
        while (i < content.length && content[i] !== '"') {
          if (content[i] === '\\') i++;
          i++;
        }
        i++;
      } else if (ch === '{') { depth++; i++; }
      else if (ch === '}') { depth--; i++; }
      else { i++; }
    }
    if (depth !== 0) return null;
    return { open, close: i - 1 };
  }
  return null;
}

export function escapeVdfString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

export function unescapeVdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function detectIndentBeforeClose(content: string, closeIdx: number): string {
  let i = closeIdx - 1;
  let indent = '';
  while (i >= 0 && (content[i] === '\t' || content[i] === ' ')) {
    indent = content[i] + indent;
    i--;
  }
  return indent;
}

/** Aplica (ou cria) "LaunchOptions" dentro do bloco do appid. */
export function setLaunchOptionsContent(content: string, appid: string, launchOptions: string): string | null {
  const bounds = findAppBlockBoundaries(content, appid);
  if (!bounds) return null;

  const blockInner = content.slice(bounds.open + 1, bounds.close);
  const launchOptsRx = /("LaunchOptions"\s*")((?:\\.|[^"\\])*)(")/;
  const escaped = escapeVdfString(launchOptions);

  if (launchOptsRx.test(blockInner)) {
    const newInner = blockInner.replace(launchOptsRx, `$1${escaped}$3`);
    return content.slice(0, bounds.open + 1) + newInner + content.slice(bounds.close);
  }

  const closeIndent = detectIndentBeforeClose(content, bounds.close);
  const fieldIndent = closeIndent + '\t';
  const insertion = `${fieldIndent}"LaunchOptions"\t\t"${escaped}"\n${closeIndent}`;
  return content.slice(0, bounds.close - closeIndent.length) + insertion + content.slice(bounds.close);
}

export function readLaunchOptionsContent(content: string, appid: string): { found: boolean; value: string | null } {
  const bounds = findAppBlockBoundaries(content, appid);
  if (!bounds) return { found: false, value: null };
  const inner = content.slice(bounds.open + 1, bounds.close);
  const m = inner.match(/"LaunchOptions"\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return { found: true, value: null };
  return { found: true, value: unescapeVdfString(m[1] ?? '') };
}
