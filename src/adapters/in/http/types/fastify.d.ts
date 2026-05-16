import 'fastify';
import '@fastify/secure-session';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: { id: number; username: string } | null;
  }
}

declare module '@fastify/secure-session' {
  interface SessionData {
    userId: number;
    username: string;
  }
}
