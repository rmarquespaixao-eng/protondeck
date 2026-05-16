import type { UserRepository, UserRow } from '../../application/ports/out/UserRepository.js';

export class InMemoryUserRepository implements UserRepository {
  users: UserRow[] = [];
  private nextId = 1;

  count(): number { return this.users.length; }

  getByUsername(username: string): UserRow | undefined {
    return this.users.find(u => u.username === username);
  }

  create(username: string, passwordHash: string): UserRow {
    const user: UserRow = {
      id: this.nextId++,
      username,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    };
    this.users.push(user);
    return user;
  }
}
