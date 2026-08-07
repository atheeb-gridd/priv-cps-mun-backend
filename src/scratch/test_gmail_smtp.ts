import nodemailer from 'nodemailer';

const appPassword = 'grjzovrhsehdlzfu';
const emails = ['cpsprimemun@gmail.com', 'tanav.trt@gmail.com'];

const run = async () => {
  for (const email of emails) {
    try {
      console.log(`Testing Gmail SMTP for: ${email}`);
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: email,
          pass: appPassword,
        },
      });

      // Verify connection configuration
      await transporter.verify();
      console.log(`Success! Verified connection for ${email}`);
      
      // Send a test email
      const info = await transporter.sendMail({
        from: `"CPS PRIME MUN 5.O" <${email}>`,
        to: 'tanav.trt@icloud.com',
        subject: 'Gmail SMTP Connection Test',
        text: 'This is a test email to confirm Gmail SMTP integration works correctly!',
      });
      console.log(`Sent email from ${email} successfully! Msg ID: ${info.messageId}`);
      process.exit(0);
    } catch (err) {
      console.error(`Failed for ${email}:`, err);
    }
  }
  process.exit(1);
};

run();
