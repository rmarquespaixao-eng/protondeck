import bcrypt from 'bcrypt';
import type { UserRepository, UserRow } from '../../ports/UserRepository.js';

const BCRYPT_COST = 12;
const MIN_USERNAME = 3;
const MIN_PASSWORD = 8;

export type AuthOutcome =
  | { ok: false; error: string }
  | { ok: true; user: UserRow };

export class AuthService {
  constructor(private readonly users: UserRepository) {}

  hasAdmin(): boolean {
    return this.users.count() > 0;
  }

  async createAdmin(username: string, password: string, passwordConfirm: string): Promise<AuthOutcome> {
    if (this.hasAdmin()) return { ok: false, error: 'admin já existe' };
    const u = username.trim();
    if (u.length < MIN_USERNAME) return { ok: false, error: `Usuário precisa de no mínimo ${MIN_USERNAME} caracteres` };
    if (password.length < MIN_PASSWORD) return { ok: false, error: `Senha precisa de no mínimo ${MIN_PASSWORD} caracteres` };
    if (password !== passwordConfirm) return { ok: false, error: 'Senhas não conferem' };
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const user = this.users.create(u, hash);
    return { ok: true, user };
  }

  async authenticate(username: string, password: string): Promise<AuthOutcome> {
    const u = username.trim();
    const found = u ? this.users.getByUsername(u) : undefined;
    const ok = found ? await bcrypt.compare(password, found.password_hash) : false;
    if (!found || !ok) return { ok: false, error: 'Usuário ou senha inválidos' };
    return { ok: true, user: found };
  }
}
