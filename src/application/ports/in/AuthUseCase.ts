import type { UserRow } from '../out/UserRepository.js';

export type AuthOutcome =
  | { ok: false; error: string }
  | { ok: true; user: UserRow };

/**
 * Inbound port: setup de admin + login.
 * Implementado por AuthService.
 */
export interface AuthUseCase {
  hasAdmin(): boolean;
  createAdmin(username: string, password: string, passwordConfirm: string): Promise<AuthOutcome>;
  authenticate(username: string, password: string): Promise<AuthOutcome>;
}
