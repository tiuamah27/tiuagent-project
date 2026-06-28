import Fastify, { type FastifyInstance } from 'fastify';
import { registerCors } from './plugins/cors.js';
import { activityRoutes } from './routes/activity.js';
import { appsRoutes } from './routes/apps.js';
import { automationRoutes } from './routes/automation.js';
import { backupsRoutes } from './routes/backups.js';
import { cloudflareRoutes } from './routes/cloudflare.js';
import { dockerRoutes } from './routes/docker.js';
import { hanfinRoutes } from './routes/hanfin.js';
import { healthRoutes } from './routes/health.js';
import { infrastructureRoutes } from './routes/infrastructure.js';
import { rootRoutes } from './routes/root.js';
import { storageRoutes } from './routes/storage.js';
import { systemRoutes } from './routes/system.js';
import { versionRoutes } from './routes/version.js';
import { filesRoutes } from './routes/files.js';

interface ServerConfig {
  host: string;
  port: number;
}

interface HttpError {
  name?: string;
  message?: string;
  statusCode?: number;
}

function getServerConfig(): ServerConfig {
  const port = Number(process.env.PORT ?? 8080);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }

  return {
    host: process.env.HOST ?? '0.0.0.0',
    port
  };
}

function normalizeError(error: unknown): HttpError {
  if (error instanceof Error) {
    return error as HttpError;
  }

  return {
    name: 'Error',
    message: 'Unknown error'
  };
}

function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    request.log.warn({ path: request.url }, 'route not found');

    return reply.code(404).send({
      error: 'Not Found',
      message: 'Route not found',
      statusCode: 404
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const normalizedError = normalizeError(error);

    request.log.error({ error: normalizedError }, 'request failed');

    const statusCode =
      normalizedError.statusCode && normalizedError.statusCode >= 400 ? normalizedError.statusCode : 500;

    return reply.code(statusCode).send({
      status: 'unavailable',
      reason: statusCode >= 500 ? 'runtime_error' : (normalizedError.message ?? 'request_failed')
    });
  });
}

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info'
    }
  });

  registerErrorHandlers(app);

  await registerCors(app);
  await app.register(rootRoutes);
  await app.register(versionRoutes, { prefix: '/api/v1' });
  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(systemRoutes, { prefix: '/api/v1' });
  await app.register(storageRoutes, { prefix: '/api/v1' });
  await app.register(dockerRoutes, { prefix: '/api/v1' });
  await app.register(appsRoutes, { prefix: '/api/v1' });
  await app.register(infrastructureRoutes, { prefix: '/api/v1' });
  await app.register(hanfinRoutes, { prefix: '/api/v1' });
  await app.register(automationRoutes, { prefix: '/api/v1' });
  await app.register(cloudflareRoutes, { prefix: '/api/v1' });
  await app.register(backupsRoutes, { prefix: '/api/v1' });
  await app.register(activityRoutes, { prefix: '/api/v1' });
  await app.register(filesRoutes, { prefix: '/api/v1' });

  return app;
}

async function start(): Promise<void> {
  const app = await buildServer();
  const config = getServerConfig();

  const closeGracefully = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
  };

  process.once('SIGINT', closeGracefully);
  process.once('SIGTERM', closeGracefully);

  await app.listen({
    host: config.host,
    port: config.port
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
