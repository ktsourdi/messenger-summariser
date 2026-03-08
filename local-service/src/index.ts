import express from 'express';
import { initializeDatabase, closeDatabase } from './db/database';
import { startScheduler, stopScheduler } from './scheduler/scheduler';
import { getConfig } from './utils/config';
import { logger } from './utils/logger';
import routes from './api/routes';

const app = express();

app.use(express.json({ limit: '10mb' }));

app.use(routes);

function start(): void {
  const config = getConfig();

  initializeDatabase();
  startScheduler();

  const server = app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`);
  });

  const shutdown = (): void => {
    logger.info('Shutting down…');
    stopScheduler();
    closeDatabase();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Start server when run directly (not imported for testing)
if (require.main === module) {
  start();
}

export { app };
