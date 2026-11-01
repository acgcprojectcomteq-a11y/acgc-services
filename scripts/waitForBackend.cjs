const http = require('http');

const url = process.env.BACKEND_URL || 'http://localhost:5000/api/health';
const timeout = Number(process.env.WAIT_TIMEOUT_MS) || 60000;
const interval = Number(process.env.WAIT_INTERVAL_MS) || 500;

function checkOnce() {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      const ok = res.statusCode >= 200 && res.statusCode < 400;
      res.resume();
      resolve(ok);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

(async () => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkOnce();
    if (ok) {
      process.exit(0);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, interval));
  }
  console.error(`Timeout waiting for backend at ${url}`);
  process.exit(1);
})();
