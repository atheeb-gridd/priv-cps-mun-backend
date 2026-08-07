import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const run = async () => {
  const fromAddresses = [
    `"CPS PRIME MUN 5.O" <b20873001@smtp-brevo.com>`,
    `"CPS PRIME MUN 5.O" <cpsprimemun@gmail.com>`,
    `"CPS PRIME MUN 5.O" <no-reply@cpsprimemun.org>`,
  ];

  for (const from of fromAddresses) {
    try {
      console.log(`Trying to send from: ${from}`);
      const info = await transporter.sendMail({
        from,
        to: 'tanav.trt@gmail.com',
        subject: `SMTP Test from ${from.split('<')[1].replace('>', '')}`,
        text: 'This is a test email to check SMTP delivery status.',
      });
      console.log(`Success! Message ID: ${info.messageId}`);
    } catch (err) {
      console.error(`Failed to send from ${from}:`, err);
    }
  }
};

run();
