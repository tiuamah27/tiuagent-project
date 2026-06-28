import type { FastifyInstance } from 'fastify';
import { listFiles, readFileContent } from '../services/files.service.js';
import type { FileEntry, FileContent } from '../types/files.types.js';

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { path: string }; Reply: FileEntry[] }>('/files/list', async (request) => {
    return listFiles(request.query.path);
  });

  app.get<{ Querystring: { path: string }; Reply: FileContent }>('/files/read', async (request) => {
    return readFileContent(request.query.path);
  });
}
