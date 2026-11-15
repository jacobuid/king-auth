import nodemailer from 'nodemailer';

export function delivery(config) {
  const transport = config.mail.host ? nodemailer.createTransport({
    host: config.mail.host, port: config.mail.port, secure: config.mail.port === 465,
    requireTLS: config.mail.port !== 465,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  }) : config.mail.sendmail ? nodemailer.createTransport({ sendmail: true, newline: 'unix', path: config.mail.sendmail }) : null;
  const smsEnabled = Boolean(config.sms.sid && config.sms.token && config.sms.from);
  return {
    emailEnabled: Boolean(transport), smsEnabled,
    async email({ email, otp, type }) {
      if (!transport) throw new Error('Email delivery is not configured');
      await transport.sendMail({ from: config.mail.from, to: email, subject: `Your King Auth ${type.replaceAll('-', ' ')} code`, text: `Your King Auth code is ${otp}. It expires in 5 minutes.\n\nIf you did not request this code, ignore this message.` });
    },
    async sms({ phoneNumber, code }) {
      if (!smsEnabled) throw new Error('SMS delivery is not configured');
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.sms.sid)}/Messages.json`, {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Basic ${Buffer.from(`${config.sms.sid}:${config.sms.token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: phoneNumber, From: config.sms.from, Body: `Your King Auth code is ${code}. It expires in 5 minutes.` }),
      });
      if (!response.ok) throw new Error('SMS delivery failed');
    },
  };
}
