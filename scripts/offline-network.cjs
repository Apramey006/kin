// Preloaded only by offline-check.mjs, including its child Node processes.
// No provider, Supabase or other non-loopback socket may leave these checks.
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof first === 'object' ? first.host : typeof args[1] === 'string' ? args[1] : undefined;
  if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Offline check blocked a non-local connection');
  return connect.apply(this,args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return Promise.reject(new Error('Offline check blocked a non-local fetch'));
  return originalFetch(input,init);
};
