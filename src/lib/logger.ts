/**
 * Production-safe logger utility
 * Silences all console output in production builds to improve performance
 */

const isDevelopment = import.meta.env.DEV;

// Create a no-op function for production
const noop = () => {};

export const logger = {
  log: isDevelopment ? console.log.bind(console) : noop,
  info: isDevelopment ? console.info.bind(console) : noop,
  warn: isDevelopment ? console.warn.bind(console) : noop,
  error: console.error.bind(console), // Always log errors
  debug: isDevelopment ? console.debug.bind(console) : noop,
};

// Override console methods in production to reduce memory/CPU overhead
if (!isDevelopment) {
  // Only override log, info, debug - keep warn and error for critical issues
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}
