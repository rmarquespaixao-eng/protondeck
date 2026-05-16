import { buildComposition } from '../composition.js';

try { process.loadEnvFile(); } catch { /* .env opcional */ }

const composition = buildComposition();

composition.services.sync.syncFromSteamLaunch()
  .then(r => {
    console.log(`sync ok: ${r.upserts} jogos (snapshot ${r.snapshot_id} @ ${r.generated_at})`);
    process.exit(0);
  })
  .catch(e => {
    console.error('sync falhou:', e.message);
    process.exit(1);
  });
