import type { DB } from './connection.js';
import type { UserRepository, UserRow } from '../../../../application/ports/out/UserRepository.js';

export class UserRepositorySqlite implements UserRepository {
  constructor(private readonly db: DB) {}

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }

  getByUsername(username: string): UserRow | undefined {
    return this.db.prepare('SELECT id, username, password_hash, created_at FROM users WHERE username = ?')
      .get(username) as UserRow | undefined;
  }

  create(username: string, passwordHash: string): UserRow {
    const now = new Date().toISOString();
    const info = this.db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run(username, passwordHash, now);
    return { id: Number(info.lastInsertRowid), username, password_hash: passwordHash, created_at: now };
  }
}
