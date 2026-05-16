import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../../../application/services/AuthService.js';

type Deps = { auth: AuthService };

type LoginBody = { username?: string; password?: string };
type SetupBody = LoginBody & { password_confirm?: string };

export function authRoutes(deps: Deps) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/setup', async (_req, reply) => {
      if (deps.auth.hasAdmin()) return reply.redirect('/login');
      return reply.view('login.ejs', { mode: 'setup', error: null, username: '' });
    });

    fastify.post<{ Body: SetupBody }>('/setup', async (req, reply) => {
      if (deps.auth.hasAdmin()) return reply.redirect('/login');
      const result = await deps.auth.createAdmin(
        req.body.username ?? '',
        req.body.password ?? '',
        req.body.password_confirm ?? '',
      );
      if (!result.ok) {
        return reply.view('login.ejs', { mode: 'setup', error: result.error, username: req.body.username ?? '' });
      }
      req.session.set('userId', result.user.id);
      req.session.set('username', result.user.username);
      return reply.redirect('/');
    });

    fastify.get('/login', async (req, reply) => {
      if (!deps.auth.hasAdmin()) return reply.redirect('/setup');
      if (req.session.get('userId')) return reply.redirect('/');
      return reply.view('login.ejs', { mode: 'login', error: null, username: '' });
    });

    fastify.post<{ Body: LoginBody }>('/login', async (req, reply) => {
      const result = await deps.auth.authenticate(req.body.username ?? '', req.body.password ?? '');
      if (!result.ok) {
        return reply.view('login.ejs', { mode: 'login', error: result.error, username: req.body.username ?? '' });
      }
      req.session.set('userId', result.user.id);
      req.session.set('username', result.user.username);
      return reply.redirect('/');
    });

    fastify.post('/logout', async (req, reply) => {
      req.session.delete();
      return reply.redirect('/login');
    });
  };
}
