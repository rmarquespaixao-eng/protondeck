import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { countUsers, createUser, getUserByUsername } from '../db.js';

type LoginBody = { username?: string; password?: string };
type SetupBody = LoginBody & { password_confirm?: string };

export async function authRoutes(fastify: FastifyInstance) {
  fastify.get('/setup', async (_req, reply) => {
    if (countUsers() > 0) return reply.redirect('/login');
    return reply.view('login.ejs', { mode: 'setup', error: null, username: '' });
  });

  fastify.post<{ Body: SetupBody }>('/setup', async (req, reply) => {
    if (countUsers() > 0) return reply.redirect('/login');
    const username = (req.body.username ?? '').trim();
    const password = req.body.password ?? '';
    const passwordConfirm = req.body.password_confirm ?? '';

    if (!username || username.length < 3) {
      return reply.view('login.ejs', { mode: 'setup', error: 'Usuário precisa de no mínimo 3 caracteres', username });
    }
    if (password.length < 8) {
      return reply.view('login.ejs', { mode: 'setup', error: 'Senha precisa de no mínimo 8 caracteres', username });
    }
    if (password !== passwordConfirm) {
      return reply.view('login.ejs', { mode: 'setup', error: 'Senhas não conferem', username });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = createUser(username, hash);
    req.session.set('userId', user.id);
    req.session.set('username', user.username);
    return reply.redirect('/');
  });

  fastify.get('/login', async (req, reply) => {
    if (countUsers() === 0) return reply.redirect('/setup');
    if (req.session.get('userId')) return reply.redirect('/');
    return reply.view('login.ejs', { mode: 'login', error: null, username: '' });
  });

  fastify.post<{ Body: LoginBody }>('/login', async (req, reply) => {
    const username = (req.body.username ?? '').trim();
    const password = req.body.password ?? '';
    const user = username ? getUserByUsername(username) : undefined;
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !ok) {
      return reply.view('login.ejs', { mode: 'login', error: 'Usuário ou senha inválidos', username });
    }
    req.session.set('userId', user.id);
    req.session.set('username', user.username);
    return reply.redirect('/');
  });

  fastify.post('/logout', async (req, reply) => {
    req.session.delete();
    return reply.redirect('/login');
  });
}
