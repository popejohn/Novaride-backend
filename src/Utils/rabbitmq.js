// src/queues/rabbitmq.js
const amqp = require('amqplib');

let connection;
let channel;

let connectionLock = null;

const connectRabbitMQ = async () => {
  try {
    if (connectionLock) {
      return await connectionLock;
    }
        
    if (!connection) {
      connectionLock = (async () => {
        connection = await amqp.connect(process.env.RABBITMQ_URL);
                
        connection.on('error', (err) => {
          console.error('❌ RabbitMQ connection error:', err);
          connection = null;
          channel = null;
        });
                
        connection.on('close', () => {
          console.error('❌ RabbitMQ connection closed');
          connection = null;
          channel = null;
        });

        channel = await connection.createChannel();
        console.log('🐇 Connected to RabbitMQ');
        return channel;
      })();
            
      await connectionLock;
      connectionLock = null; // Clear lock after successful connection
    }
    return channel;
  } catch (err) {
    console.error('❌ RabbitMQ connection error:', err);
    connectionLock = null;
  }
};

const publishOTPJob = async (otpData) => {
  try {
    const channel = await connectRabbitMQ();
    const queue = 'otp_queue';

    await channel.assertQueue(queue, { durable: true });

    channel.sendToQueue(queue, Buffer.from(JSON.stringify(otpData)), {
      persistent: true
    });

    console.log('📨 OTP job published:', otpData.phone);
    return true;

  } catch (err) {
    console.error('❌ Failed to publish OTP job:', err);
    return false;
  }
};

module.exports = { publishOTPJob };
