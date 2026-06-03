const request = require('supertest');
// Create a minimal express app for testing health routes only
const express = require('express');
const healthRoutes = require('../src/Routes/health');

const app = express();
app.use(express.json());
app.use('/health', healthRoutes);

describe('Health Check Endpoints', () => {
  test('GET /health - should return health status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200); // Health check should always return 200

    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('database');
    expect(response.body).toHaveProperty('memory');
  });

  test('GET /health/ready - should return readiness status', async () => {
    const response = await request(app)
      .get('/health/ready')
      .expect(503); // Expect 503 since DB is not connected

    expect(response.body).toHaveProperty('status', 'NOT READY');
    expect(response.body).toHaveProperty('message', 'Database not connected');
  });
});