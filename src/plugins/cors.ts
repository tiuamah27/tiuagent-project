import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

export async function registerCors(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: true
  });
}
