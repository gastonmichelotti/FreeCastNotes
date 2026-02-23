import { buildServer } from './server.js';
import { getConfig } from './config.js';

const config = getConfig();
const app = await buildServer({ config });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ host: config.host, port: config.port }, 'freecast-sync-hub listening');
} catch (err) {
  app.log.error({ err: err instanceof Error ? err.message : String(err) }, 'failed_to_start');
  process.exit(1);
}
