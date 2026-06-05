import type { WidescreenInfo } from '../pcgw/WidescreenInfo.js';
import type {
  CheckRecommendation, ProtonDBSummary, SteamStoreInfo,
} from './CheckResult.js';

const GO_TIERS      = new Set(['platinum', 'gold', 'native']);
const CAUTION_TIERS = new Set(['silver']);
const RISKY_TIERS   = new Set(['bronze', 'borked']);

export function computeRecommendation(
  store: SteamStoreInfo,
  proton: ProtonDBSummary,
  pcgw: WidescreenInfo,
): { rec: CheckRecommendation; reasons: string[] } {
  const reasons: string[] = [];

  if (store.comingSoon) {
    reasons.push('Jogo ainda nao foi lancado (coming soon na Steam).');
    return { rec: 'unreleased', reasons };
  }

  const linuxNative = store.platforms?.linux === true;
  if (linuxNative) reasons.push('Suporte Linux nativo declarado na Steam.');

  if (proton.found && GO_TIERS.has(proton.tier)) {
    reasons.push(`ProtonDB: tier ${proton.tier} (${proton.total} relatos).`);
    return { rec: 'go', reasons };
  }
  if (linuxNative && (!proton.found || proton.tier === 'pending')) {
    reasons.push('Suporte nativo + sem dados ProtonDB suficientes (assume nativo funciona).');
    return { rec: 'go', reasons };
  }
  if (proton.found && CAUTION_TIERS.has(proton.tier)) {
    reasons.push(`ProtonDB tier silver (${proton.total} relatos) — funciona mas pode exigir tweaks.`);
    const uw = pcgw.features.ultrawidescreen;
    if (uw?.state === 'hackable')   reasons.push('Ultra-widescreen 21:9 requer mod (PCGamingWiki).');
    if (uw?.state === 'unsupported') reasons.push('Ultra-widescreen 21:9 nao suportado nativamente.');
    return { rec: 'caution', reasons };
  }
  if (proton.found && RISKY_TIERS.has(proton.tier)) {
    reasons.push(`ProtonDB tier ${proton.tier} (${proton.total} relatos) — historico ruim em Proton.`);
    if (!linuxNative) reasons.push('Sem suporte Linux nativo declarado.');
    return { rec: 'risky', reasons };
  }

  reasons.push('Sem dados suficientes (ProtonDB pending/sem relatos).');
  if (linuxNative) reasons.push('Mas o jogo declara suporte Linux nativo.');
  return { rec: linuxNative ? 'go' : 'no-data', reasons };
}
