process.env.NODE_ENV = 'test';
import { httpServer } from './server/server.js';
import { initDb } from './server/config/db.js';

let activeServer = null;

export async function getTestBaseUrl() {
  if (process.env.TEST_URL) {
    return process.env.TEST_URL;
  }

  await initDb();

  if (!httpServer.listening) {
    await new Promise((resolve) => {
      activeServer = httpServer.listen(0, '127.0.0.1', () => {
        const addr = activeServer.address();
        process.env.TEST_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  } else {
    const addr = httpServer.address();
    process.env.TEST_URL = `http://127.0.0.1:${typeof addr === 'object' ? addr.port : 5000}`;
  }

  return process.env.TEST_URL;
}

export async function stopTestServer() {
  if (activeServer && activeServer.listening) {
    await new Promise((resolve) => activeServer.close(resolve));
    activeServer = null;
  }
}
