'use strict';

// CommonJS entry point for Passenger on shared hosting.
import('./server/index.mjs').catch(error => {
  let message = String(error.message || error.name);
  for (const name of ['DB_PASSWORD', 'SMTP_PASSWORD', 'TWILIO_AUTH_TOKEN', 'BETTER_AUTH_SECRET']) {
    if (process.env[name]) message = message.replaceAll(process.env[name], '[redacted]');
  }
  console.error('King Auth startup failed:', error.code || error.name, message.slice(0, 500));
  require('node:http').createServer((req, res) => {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '60', 'X-Content-Type-Options': 'nosniff' });
    res.end('King Auth setup is being completed. Please try again shortly.\n');
  }).listen(process.env.PORT || 3000);
});
