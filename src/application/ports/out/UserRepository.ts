export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
};

export interface UserRepository {
  count(): number;
  getByUsername(username: string): UserRow | undefined;
  create(username: string, passwordHash: string): UserRow;
}
