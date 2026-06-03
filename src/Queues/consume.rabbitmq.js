// Enhanced RabbitMQ consumer with error handling, retry logic, and dead letter queues
const amqp = require('amqplib');
const { sendOTP } = require('../Services/message.service');

class OTPWorker {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
    this.prefetchCount = 5; // Process up to 5 messages concurrently
  }

  async connect() {
    try {
      this.connection = await amqp.connect(process.env.RABBITMQ_URL);
      this.channel = await this.connection.createChannel();

      // Handle connection errors
      this.connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
        this.reconnect();
      });

      this.connection.on('close', () => {
        console.log('RabbitMQ connection closed, attempting reconnect...');
        this.reconnect();
      });

      console.log('✅ RabbitMQ connected successfully');
      return true;
    } catch (error) {
      console.error('❌ RabbitMQ connection failed:', error);
      // Retry connection after delay
      setTimeout(() => this.connect(), this.retryDelay);
      return false;
    }
  }

  async reconnect() {
    console.log('Attempting to reconnect to RabbitMQ...');
    this.connection = null;
    this.channel = null;
    setTimeout(() => this.connect(), this.retryDelay);
  }

  async setupQueues() {
    try {
      const mainQueue = 'otp_queue';
      const deadLetterQueue = 'otp_queue_dlq';
      const retryQueue = 'otp_queue_retry';

      // Set up dead letter exchange
      await this.channel.assertExchange('otp_dlx', 'direct', { durable: true });

      // Set up dead letter queue
      await this.channel.assertQueue(deadLetterQueue, {
        durable: true,
        arguments: {
          'x-message-ttl': 7 * 24 * 60 * 60 * 1000 // 7 days
        }
      });
      await this.channel.bindQueue(deadLetterQueue, 'otp_dlx', 'failed');

      // Set up retry queue with TTL
      await this.channel.assertQueue(retryQueue, {
        durable: true,
        arguments: {
          'x-message-ttl': 60000, // 1 minute
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': mainQueue
        }
      });

      // Set up main queue with dead letter exchange
      await this.channel.assertQueue(mainQueue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'otp_dlx',
          'x-dead-letter-routing-key': 'failed'
        }
      });

      // Set prefetch count for controlled concurrency
      await this.channel.prefetch(this.prefetchCount);

      console.log('✅ Queues setup completed');
      return { mainQueue, deadLetterQueue, retryQueue };
    } catch (error) {
      console.error('❌ Queue setup failed:', error);
      throw error;
    }
  }

  async processMessage(msg, queue) {
    let retryCount = 0;

    try {
      const otpData = JSON.parse(msg.content.toString());
      console.log('📥 OTP job received:', { phone: otpData.phone, attempt: retryCount + 1 });

      // Validate message structure
      if (!otpData.otp || !otpData.phone) {
        throw new Error('Invalid message structure: missing otp or phone');
      }

      // Process the OTP sending
      await sendOTP(otpData.otp, otpData.phone);

      // Acknowledge successful processing
      this.channel.ack(msg);
      console.log('✅ OTP sent successfully to:', otpData.phone);

    } catch (error) {
      console.error(`❌ OTP processing error for message ${msg.fields.deliveryTag}:`, error);

      retryCount = (msg.properties.headers && msg.properties.headers['x-retry-count']) || 0;

      if (retryCount < this.maxRetries) {
        // Retry the message
        retryCount++;
        console.log(`🔄 Retrying message (attempt ${retryCount}/${this.maxRetries})`);

        // Republish to retry queue with updated headers and reliable handling
        try {
          const publishOk = this.channel.publish('', 'otp_queue_retry', msg.content, {
            persistent: true,
            headers: {
              'x-retry-count': retryCount,
              'x-original-queue': queue,
              'x-error-message': error.message
            }
          });

          if (publishOk) {
            this.channel.ack(msg);
          } else {
            console.warn('⚠️ RabbitMQ publish returned false (buffer full), retrying message later');
            this.channel.nack(msg, false, true);
          }
        } catch (publishError) {
          console.error('❌ Failed to republish to retry queue:', publishError);
          this.channel.nack(msg, false, true);
        }
      } else {
        // Max retries exceeded, send to dead letter queue
        console.error(`💀 Max retries exceeded for message ${msg.fields.deliveryTag}, sending to DLQ`);
        this.channel.reject(msg, false); // This will route to DLQ via dead letter exchange
      }
    }
  }

  async start() {
    try {
      const connected = await this.connect();
      if (!connected) return;

      const { mainQueue } = await this.setupQueues();

      console.log(`👷 OTP Worker is running... (prefetch: ${this.prefetchCount})`);

      // Start consuming messages
      this.channel.consume(mainQueue, (msg) => {
        if (msg !== null) {
          this.processMessage(msg, mainQueue);
        }
      }, { noAck: false });

    } catch (error) {
      console.error('❌ Worker startup failed:', error);
      // Retry startup after delay
      setTimeout(() => this.start(), this.retryDelay);
    }
  }

  async stop() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      console.log('👷 OTP Worker stopped');
    } catch (error) {
      console.error('Error stopping worker:', error);
    }
  }
}

// Handle graceful shutdown
const worker = new OTPWorker();

process.on('SIGINT', async () => {
  console.log('Shutting down OTP worker...');
  await worker.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down OTP worker...');
  await worker.stop();
  process.exit(0);
});

// Start the worker
worker.start();
