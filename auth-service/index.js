import './tracing.js';
import 'dotenv/config';
import express from 'express';
import promClient from 'prom-client';
import router from './src/controller/auth.controller.js';
import http from 'http';
import logger from './logger.js';

const app = express();
const metricsApp = express();

const METRICS_PORT = 4001;

app.use(express.json());

app.use('/api/auth', (req, res, next) => {
  res.on('finish', () => {
    logger.info('request completed', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
    });
  });
  next();
});

app.use('/api/auth', router);

app.get('/metrics', async (res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

const server = http.createServer(app);
const metricsServer = http.createServer(metricsApp);

metricsServer.listen(METRICS_PORT, () => {
  logger.info(`Prometheus metrics at http://localhost:${METRICS_PORT}/metrics`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'];

shutdownSignals.forEach((sig) => {
  process.on(sig, () => {
    logger.warn(`Received ${sig}, shutting down gracefully...`);

    server.close((err) => {
      if (err) {
        logger.error('Error during shutdown', { error: err.message });
        process.exit(1);
      }

      logger.info('Server closed gracefully');
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn('Forcing shutdown...');
      process.exit(1);
    }, 5000);
  });
});