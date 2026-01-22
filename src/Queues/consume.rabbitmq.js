// src/workers/otpWorker.js
const amqp = require("amqplib");
const { sendOTP } = require("../Services/message.service");

(async () => {
    try {
        const connection = await amqp.connect(process.env.RABBITMQ_URL);
        const channel = await connection.createChannel();
        const queue = "otp_queue";

        await channel.assertQueue(queue, { durable: true });

        console.log("👷 OTP Worker is running...");

        channel.consume(queue, (msg) => {
            if (msg !== null) {
                const otpData = JSON.parse(msg.content.toString());
                console.log("📥 OTP job received:", otpData);

                sendOTP(otpData.otp, otpData.phone);

                channel.ack(msg);
            }
        });
    } catch (err) {
        console.error("❌ OTP Worker error:", err);
    }
})();
