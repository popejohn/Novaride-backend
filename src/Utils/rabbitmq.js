// src/queues/rabbitmq.js
const amqp = require('amqplib');

let connection;
let channel;

const connectRabbitMQ = async () => {
    try {
        if (!connection) {
            connection = await amqp.connect(process.env.RABBITMQ_URL);
            channel = await connection.createChannel();
            console.log("🐇 Connected to RabbitMQ");
        }
        return channel;
    } catch (err) {
        console.error("❌ RabbitMQ connection error:", err);
    }
};

const publishOTPJob = async (otpData) => {
    try {
        const channel = await connectRabbitMQ();
        const queue = "otp_queue";

        await channel.assertQueue(queue, { durable: true });

        channel.sendToQueue(queue, Buffer.from(JSON.stringify(otpData)), {
            persistent: true
        });

        console.log("📨 OTP job published:", otpData.phone);
        return true;

    } catch (err) {
        console.error("❌ Failed to publish OTP job:", err);
        return false;
    }
};

module.exports = { publishOTPJob };
