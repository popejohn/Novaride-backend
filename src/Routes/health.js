const express = require('express');
const mongoose = require('mongoose');
const env = require('../Configs/env');
const router = express.Router();

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    // Basic health response
    const healthCheck = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbStatus,
        name: mongoose.connection.name || 'unknown'
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      }
    };

    // Health check always returns 200 - it's about app health, not dependencies
    res.status(200).json(healthCheck);

  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Readiness check (stricter than health check)
router.get('/ready', async (req, res) => {
  try {
    // Check if database is ready for operations
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        status: 'NOT READY',
        message: 'Database not connected'
      });
    }

    res.status(200).json({
      status: 'READY',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      message: error.message
    });
  }
});

// System monitoring endpoint (detailed metrics)
router.get('/metrics', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const os = require('os');

    // Database metrics
    const dbStats = mongoose.connection.readyState === 1 ? {
      status: 'connected',
      name: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      poolSize: mongoose.connection.db ? await mongoose.connection.db.stats() : null
    } : { status: 'disconnected' };

    // System metrics
    const systemMetrics = {
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        unit: 'MB'
      },
      cpu: {
        usage: process.cpuUsage(),
        system: os.cpus().length
      },
      loadAverage: os.loadavg(),
      platform: process.platform,
      nodeVersion: process.version
    };

    // Queue status (calls RabbitMQ management API if configured)
    let queueStatus = {
      rabbitmq: {
        status: 'unknown',
        queues: ['otp_queue', 'otp_queue_retry', 'otp_queue_dlq']
      }
    };

    if (env.RABBITMQ_MANAGEMENT_URL && env.RABBITMQ_MANAGEMENT_USER && env.RABBITMQ_MANAGEMENT_PASS) {
      try {
        const rabbitResponse = await fetch(`${env.RABBITMQ_MANAGEMENT_URL}/api/queues`, {
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${env.RABBITMQ_MANAGEMENT_USER}:${env.RABBITMQ_MANAGEMENT_PASS}`).toString('base64')
          }
        });

        if (rabbitResponse.ok) {
          const queues = await rabbitResponse.json();
          queueStatus.rabbitmq = {
            status: 'connected',
            count: queues.length,
            queues: queues
              .filter(q => ['otp_queue', 'otp_queue_retry', 'otp_queue_dlq'].includes(q.name))
              .map(q => ({ name: q.name, messages: q.messages, consumers: q.consumers }))
          };
        } else {
          queueStatus.rabbitmq.status = 'down';
          queueStatus.rabbitmq.error = `Management API error ${rabbitResponse.status}`;
        }
      } catch (queueError) {
        queueStatus.rabbitmq.status = 'error';
        queueStatus.rabbitmq.error = queueError.message;
      }
    }

    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: dbStats,
      system: systemMetrics,
      queues: queueStatus,
      environment: env.NODE_ENV
    });

  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Failed to collect metrics',
      error: error.message
    });
  }
});

router.get("/redis", async (req, res) => {
  try {
    await upstashRedis.set("health", Date.now().toString(), { ex: 10 });

    res.json({
      status: "healthy",
      redis: "connected",
    });
  } catch (err) {
    res.status(500).json({
      status: "unhealthy",
      redis: err.message,
    });
  }
});

module.exports = router;