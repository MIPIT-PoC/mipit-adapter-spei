import express from 'express';
import { ulid } from 'ulid';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';

const app = express();
app.use(express.json());

app.post('/spei/payments', (req, res) => {
  const { monto, clabe_destino } = req.body;

  if (clabe_destino && !/^\d{18}$/.test(clabe_destino)) {
    return res.status(200).json({
      spei_tx_id: `SPEI-${ulid()}`,
      estatus: 'RECHAZADO',
      monto,
      moneda: 'MXN',
      timestamp: new Date().toISOString(),
      codigo_error: 'SPEI_INVALID_CLABE',
      mensaje_error: 'CLABE destino inválida (debe tener 18 dígitos)',
    });
  }

  const shouldFail = Math.random() < 0.1;

  if (shouldFail) {
    return res.status(200).json({
      spei_tx_id: `SPEI-${ulid()}`,
      estatus: 'RECHAZADO',
      monto,
      moneda: 'MXN',
      timestamp: new Date().toISOString(),
      codigo_error: 'SPEI_TIMEOUT',
      mensaje_error: 'Timeout en la red SPEI',
    });
  }

  const latency = 100 + Math.random() * 400;
  setTimeout(() => {
    res.status(200).json({
      spei_tx_id: `SPEI-${ulid()}`,
      estatus: 'ACEPTADO',
      monto,
      moneda: 'MXN',
      timestamp: new Date().toISOString(),
    });
  }, latency);
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'spei-mock' }));

export function startMockServer() {
  const port = env.SPEI_MOCK_PORT;
  app.listen(port, () => logger.info(`SPEI mock sandbox running on port ${port}`));
}

if (process.argv[1]?.includes('mock-server')) {
  startMockServer();
}
