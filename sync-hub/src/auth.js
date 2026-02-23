import crypto from 'node:crypto';

function timingSafeEq(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function authPreHandler(config) {
  return async function verify(request, reply) {
    const routePath =
      request.routeOptions?.url ||
      request.routerPath ||
      String(request.url || '').split('?')[0];
    if (routePath === '/health') return;
    if (!routePath.startsWith('/sync/')) return;

    const auth = request.headers.authorization;
    const expected = config.token;
    if (!expected) {
      request.log.error('SYNC_TOKEN not configured');
      return reply.code(500).send({ error: 'server_not_configured' });
    }
    if (!auth?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const token = auth.slice('Bearer '.length);
    if (!timingSafeEq(token, expected)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    if (config.hmacSecret && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const sig = request.headers['x-signature'];
      if (typeof sig !== 'string' || !sig.startsWith('sha256=')) {
        return reply.code(401).send({ error: 'invalid_signature' });
      }
      const rawBody = request.rawBody ?? '';
      const digest = crypto.createHmac('sha256', config.hmacSecret).update(rawBody).digest('hex');
      if (!timingSafeEq(sig.slice(7), digest)) {
        return reply.code(401).send({ error: 'invalid_signature' });
      }
    }
  };
}
