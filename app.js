'use strict';

// CommonJS entry point for Passenger on shared hosting.
import('./server/index.mjs').catch(error => {
  console.error('King Auth startup failed:', error.code || error.name);
  process.exitCode = 1;
});
