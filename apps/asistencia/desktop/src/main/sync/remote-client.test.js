/**
 * Contrato de regresión del cliente HTTP/HTTPS aislado del runtime Electron.
 *
 * @see ./remote-client.js
 * @see ../../../../api/src/modules/attendance/attendance.controller.ts
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteClient } = require('./remote-client');

test('recognizes transient network failures', () => {
  const client = createRemoteClient({
    http: {},
    https: {},
    getAuthState: () => ({ accessToken: null, refreshToken: null }),
    saveAuthState: () => {},
  });

  assert.equal(client.isTransientNetworkError(new Error('ECONNRESET')), true);
  assert.equal(client.isTransientNetworkError(new Error('ETIMEDOUT')), true);
  assert.equal(client.isTransientNetworkError(new Error('socket hang up')), true);
  assert.equal(client.isTransientNetworkError(new Error('validation failed')), false);
});

test('sends authenticated JSON payload and parses response', async () => {
  let requestOptions;
  let writtenBody = '';
  const fakeHttp = {
    request(options, callback) {
      requestOptions = options;
      const response = {
        statusCode: 200,
        on(event, handler) {
          if (event === 'data') handler('{"processed_local_ids":["local-1"]}');
          if (event === 'end') handler();
        },
      };
      callback(response);
      return {
        on() {},
        write(body) { writtenBody = body; },
        end() {},
        destroy() {},
      };
    },
  };
  const client = createRemoteClient({
    http: fakeHttp,
    https: fakeHttp,
    getAuthState: () => ({ accessToken: 'jwt', refreshToken: null }),
    saveAuthState: () => {},
  });

  const response = await client.sendSyncRequest('http://localhost:43000', { registros: [] });

  assert.deepEqual(response, { processed_local_ids: ['local-1'] });
  assert.equal(requestOptions.method, 'POST');
  assert.equal(requestOptions.path, '/attendance/sync');
  assert.equal(requestOptions.headers.Authorization, 'Bearer jwt');
  assert.deepEqual(JSON.parse(writtenBody), { registros: [] });
});

test('pullUsersFromServer fetches users with bearer token', async () => {
  let requestOptions;
  const mockUsers = [{ dni: '12345678', nombre_completo: 'Juan Perez' }];
  const fakeHttp = {
    request(options, callback) {
      requestOptions = options;
      const response = {
        statusCode: 200,
        on(event, handler) {
          if (event === 'data') handler(JSON.stringify(mockUsers));
          if (event === 'end') handler();
        },
      };
      callback(response);
      return {
        on() {},
        write() {},
        end() {},
        destroy() {},
      };
    },
  };
  const client = createRemoteClient({
    http: fakeHttp,
    https: fakeHttp,
    getAuthState: () => ({ accessToken: 'my-token', refreshToken: null }),
    saveAuthState: () => {},
  });

  const users = await client.pullUsersFromServer('http://localhost:43000');
  assert.deepEqual(users, mockUsers);
  assert.equal(requestOptions.path, '/users/attendance-users');
  assert.equal(requestOptions.headers.Authorization, 'Bearer my-token');
});

test('pullAttendanceFromServer fetches synced marks with bearer token', async () => {
  let requestOptions;
  const mockMarks = [{ local_id: 'm1', dni: '87654321', tipo_marca: 'entrada' }];
  const fakeHttp = {
    request(options, callback) {
      requestOptions = options;
      const response = {
        statusCode: 200,
        on(event, handler) {
          if (event === 'data') handler(JSON.stringify(mockMarks));
          if (event === 'end') handler();
        },
      };
      callback(response);
      return {
        on() {},
        write() {},
        end() {},
        destroy() {},
      };
    },
  };
  const client = createRemoteClient({
    http: fakeHttp,
    https: fakeHttp,
    getAuthState: () => ({ accessToken: 'my-token', refreshToken: null }),
    saveAuthState: () => {},
  });

  const marks = await client.pullAttendanceFromServer('http://localhost:43000');
  assert.deepEqual(marks, mockMarks);
  assert.equal(requestOptions.path, '/attendance/synced-marks');
  assert.equal(requestOptions.headers.Authorization, 'Bearer my-token');
});

test('refreshes token on HTTP 401 when refreshToken is available', async () => {
  let attempts = 0;
  let savedTokens = null;
  const fakeHttp = {
    request(options, callback) {
      attempts++;
      if (options.path === '/auth/refresh') {
        const response = {
          statusCode: 200,
          on(event, handler) {
            if (event === 'data') handler(JSON.stringify({ access_token: 'new-jwt-token' }));
            if (event === 'end') handler();
          },
        };
        callback(response);
      } else if (attempts === 1) {
        // First attempt fails with 401
        const response = {
          statusCode: 401,
          on(event, handler) {
            if (event === 'data') handler('Unauthorized');
            if (event === 'end') handler();
          },
        };
        callback(response);
      } else {
        // Second attempt succeeds
        const response = {
          statusCode: 200,
          on(event, handler) {
            if (event === 'data') handler(JSON.stringify([{ dni: '123' }]));
            if (event === 'end') handler();
          },
        };
        callback(response);
      }
      return {
        on() {},
        write() {},
        end() {},
        destroy() {},
      };
    },
  };

  let currentAuth = { accessToken: 'expired-token', refreshToken: 'valid-refresh' };
  const client = createRemoteClient({
    http: fakeHttp,
    https: fakeHttp,
    getAuthState: () => currentAuth,
    saveAuthState: (tokens) => {
      savedTokens = tokens;
      currentAuth = tokens;
    },
  });

  const result = await client.pullUsersFromServer('http://localhost:43000');
  assert.deepEqual(result, [{ dni: '123' }]);
  assert.equal(savedTokens.accessToken, 'new-jwt-token');
});
