import type { AIConfigRow } from '../out/AIConfigRepository.js';
import type { ProtonLogResult } from '../out/ProtonLogReader.js';

export type CurrentScreenState = {
  env: Record<string, string>;
  args: string[];
  wrappers: string[];
  gamescope: Record<string, string>;
  resW: string;
  resH: string;
  resFormats: string[];
};

/**
 * Inbound port: orquestracao do agente IA (diagnose / suggest / troubleshoot).
 * Implementado por AIService.
 */
export interface AIUseCase {
  getConfig(): AIConfigRow | undefined;
  setConfig(cfg: { provider: string; model: string; api_key: string | null; base_url: string | null }): void;
  readProtonLog(appid: string): ProtonLogResult;
  diagnose(appid: string): Promise<Record<string, unknown>>;
  suggest(appid: string): Promise<Record<string, unknown>>;
  troubleshoot(appid: string, problem: string, state: CurrentScreenState): Promise<Record<string, unknown>>;
}
