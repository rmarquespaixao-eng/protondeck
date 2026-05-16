import { buildComposition } from './composition.js';
import { buildServer } from './adapters/primary/http/Server.js';

try { process.loadEnvFile(); } catch { /* .env opcional */ }

const sessionKeyHex = process.env.SESSION_KEY;
if (!sessionKeyHex || !/^[0-9a-fA-F]{64}$/.test(sessionKeyHex)) {
  console.error('SESSION_KEY não está configurada ou é inválida (precisa de 64 hex chars = 32 bytes).');
  console.error('');
  console.error('  Setup rápido:');
  console.error('    cp .env.example .env');
  console.error('    echo "SESSION_KEY=$(openssl rand -hex 32)" >> .env');
  console.error('    npm run dev');
  console.error('');
  console.error('  Ou ad-hoc:');
  console.error('    SESSION_KEY=$(openssl rand -hex 32) npm run dev');
  process.exit(1);
}
const sessionKey = Buffer.from(sessionKeyHex, 'hex');

const composition = buildComposition();
const fastify = await buildServer({
  composition,
  sessionKey,
  isProduction: process.env.NODE_ENV === 'production',
});

const port = Number(process.env.PORT ?? 3030);
const host = process.env.HOST ?? '127.0.0.1';

fastify.listen({ port, host }).then(addr => {
  fastify.log.info(`ProtonDeck rodando em ${addr}`);
}).catch(err => {
  fastify.log.error(err);
  process.exit(1);
});
