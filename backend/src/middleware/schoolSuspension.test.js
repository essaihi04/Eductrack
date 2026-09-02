import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// These integration tests use only fake credentials and in-memory responses.
// Do not load a developer's .env or let a forgotten mock contact Supabase.
mock.method(dotenv, 'config', () => ({ parsed: {} }));
process.env.SUPABASE_URL = 'https://school-suspension-test.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.SUPABASE_JWT_SECRET = 'school-suspension-test-secret';
process.env.SUPABASE_JWT_ISSUER = '';
process.env.PROFILE_CACHE_TTL_MS = '60000';

let state;
const nativeFetch = globalThis.fetch;
mock.method(globalThis, 'fetch', async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  assert.equal(url.origin, process.env.SUPABASE_URL, 'Unexpected external request');
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    state.signIns += 1;
    return Response.json({ ...state.session, user: state.user });
  }
  if (url.pathname === '/auth/v1/logout' && options?.method === 'POST') {
    return new Response(null, { status: 204 });
  }
  throw new Error(`Unmocked request: ${url.pathname}`);
});

const { supabase, supabaseAdmin } = await import('../config/supabase.js');
const { invalidateProfileCache, getCachedProfile, setCachedProfile } = await import('../utils/authToken.js');
const { authenticate } = await import('./auth.js');
const { default: authRouter } = await import('../routes/auth.routes.js');

function query(table) {
  const operation = { table, action: 'select', filters: {}, values: null };
  const finish = async () => {
    state.queries.push({ ...operation, filters: { ...operation.filters } });
    if (table === 'profiles') {
      if (operation.action === 'update') {
        state.updates.push({ ...operation.values });
        state.profile = { ...state.profile, ...operation.values };
      }
      return { data: { ...state.profile }, error: null };
    }
    if (table === 'schools') {
      return {
        data: state.schoolError ? null : state.schools[operation.filters.id] || null,
        error: state.schoolError,
      };
    }
    if (table === 'account_schools') {
      return {
        data: state.linksError ? null : state.links.map((school_id) => ({ school_id, school: state.schools[school_id] })),
        error: state.linksError,
      };
    }
    throw new Error(`Unmocked table: ${table}`);
  };
  const builder = {
    select() { return builder; },
    eq(column, value) { operation.filters[column] = value; return builder; },
    update(values) { operation.action = 'update'; operation.values = values; return builder; },
    single: finish,
    maybeSingle: finish,
    then(resolve, reject) { return finish().then(resolve, reject); },
  };
  return builder;
}

mock.method(supabaseAdmin, 'from', query);
mock.method(supabase, 'from', query);
for (const client of [supabase, supabaseAdmin]) {
  mock.method(client.auth, 'getUser', async () => {
    state.remoteAuthChecks += 1;
    return { data: { user: state.user }, error: null };
  });
}
mock.method(supabase.auth, 'signInWithPassword', async () => {
  state.signIns += 1;
  return { data: { user: state.user, session: state.session }, error: null };
});
mock.method(supabaseAdmin.auth.admin, 'updateUserById', async () => {
  state.passwordUpdates += 1;
  return { data: { user: state.user }, error: null };
});

let server;
let baseUrl;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.get('/private', authenticate, (req, res) => res.json({ user: req.user }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  invalidateProfileCache();
  mock.restoreAll();
});

beforeEach(() => {
  invalidateProfileCache();
  const user = { id: 'user-test', email: 'user@example.invalid', aud: 'authenticated' };
  state = {
    user,
    profile: { ...user, role: 'school_admin', school_id: 'school-a' },
    schools: {
      'school-a': { id: 'school-a', name: 'School A', status: 'active' },
      'school-b': { id: 'school-b', name: 'School B', status: 'active' },
    },
    links: ['school-a', 'school-b'],
    linksError: null,
    schoolError: null,
    queries: [],
    updates: [],
    signIns: 0,
    passwordUpdates: 0,
    remoteAuthChecks: 0,
    session: {
      access_token: jwt.sign({ sub: user.id, email: user.email, aud: 'authenticated' }, process.env.SUPABASE_JWT_SECRET, { expiresIn: '1h' }),
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    },
  };
});

async function request(path, { method = 'GET', body } = {}) {
  const response = await nativeFetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${state.session.access_token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

function assertSuspended(response) {
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'SCHOOL_SUSPENDED');
  assert.equal(typeof response.body.error, 'string');
  assert.ok(response.body.error.length > 0);
  assert.equal(response.body.session, undefined);
}

test('an existing locally verified session stops immediately on suspension and works again on reactivation', async () => {
  assert.equal((await request('/private')).status, 200);
  assert.ok(getCachedProfile(state.user.id), 'The profile must actually be cached');

  state.schools['school-a'].status = 'suspended';
  assertSuspended(await request('/private'));

  state.schools['school-a'].status = 'active';
  const reactivated = await request('/private');
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body.user.school_id, 'school-a');
  assert.equal(state.remoteAuthChecks, 0, 'This exercises locally verified JWTs');
  assert.equal(state.queries.filter((q) => q.table === 'profiles').length, 1);
  assert.equal(state.queries.filter((q) => q.table === 'schools').length, 3);
});

test('suspension denies every school role, including cached staff and parent profiles', async (t) => {
  for (const role of ['admin', 'school_admin', 'teacher', 'student', 'parent', 'finance_manager', 'pedagogical_director', 'pedagogical_manager', 'transport_manager', 'driver']) {
    await t.test(role, async () => {
      state.schools['school-a'].status = 'suspended';
      state.profile = { ...state.profile, role };
      setCachedProfile(state.user.id, { ...state.profile });
      assertSuspended(await request('/private'));
    });
  }
  assert.equal(state.queries.filter((q) => q.table === 'profiles').length, 0);
});

test('the super administrator retains access when its linked school is suspended', async () => {
  state.profile.role = 'super_admin';
  state.schools['school-a'].status = 'suspended';
  assert.equal((await request('/private')).status, 200);
});

test('legacy profiles without a school retain their existing access', async () => {
  state.profile.school_id = null;
  assert.equal((await request('/private')).status, 200);
});

test('school lookup failures cannot grant access to an already cached profile', async () => {
  assert.equal((await request('/private')).status, 200);
  state.schoolError = { code: 'PGRST003', message: 'Simulated database unavailability' };
  assert.equal((await request('/private')).status, 503);
});

test('a missing or non-active school cannot grant API access', async (t) => {
  for (const school of [null, { id: 'school-a', status: 'inactive' }, { id: 'school-a', status: null }]) {
    await t.test(school ? `status ${school.status}` : 'missing school', async () => {
      state.schools['school-a'] = school;
      const response = await request('/private');
      assert.equal(response.status, 403);
      assert.equal(response.body.code, 'SCHOOL_UNAVAILABLE');
    });
  }
});

test('/me blocks a suspended school and offers only other active schools without exposing the profile', async () => {
  state.schools['school-a'].status = 'suspended';
  state.schools['school-c'] = { id: 'school-c', name: 'School C', status: 'suspended' };
  state.links = ['school-a', 'school-b', 'school-c'];
  const response = await request('/auth/me');
  assertSuspended(response);
  assert.equal(response.body.profile, undefined);
  assert.deepEqual(response.body.available_schools.map((school) => school.id), ['school-b']);
});

test('/me reports transient linked-school lookup failures instead of an incomplete school selection', async () => {
  state.linksError = { code: 'PGRST003', message: 'Simulated database unavailability' };
  const response = await request('/auth/me');
  assert.equal(response.status, 503);
  assert.equal(response.body.available_schools, undefined);
});

test('/me supports a legacy database without the optional account_schools table', async () => {
  state.linksError = { code: '42P01', message: 'relation "account_schools" does not exist' };
  const response = await request('/auth/me');
  assert.equal(response.status, 200);
  assert.equal(response.body.profile.school_id, 'school-a');
  assert.deepEqual(response.body.available_schools.map((school) => school.id), ['school-a']);
});

test('/me still returns the profile and school for an active school', async () => {
  const response = await request('/auth/me');
  assert.equal(response.status, 200);
  assert.equal(response.body.profile.school_id, 'school-a');
  assert.equal(response.body.profile.school.id, 'school-a');
});

test('/login does not expose a session for a suspended school', async () => {
  state.schools['school-a'].status = 'suspended';
  assertSuspended(await request('/auth/login', {
    method: 'POST', body: { email: state.user.email, password: 'test-password' },
  }));
  assert.equal(state.signIns, 1);
});

test('/login still provides a session for an active school', async () => {
  const response = await request('/auth/login', {
    method: 'POST', body: { email: state.user.email, password: 'test-password' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.profile.school_id, 'school-a');
  assert.equal(response.body.session.access_token, state.session.access_token);
});

test('/me and /login fail closed when school status cannot be read', async () => {
  state.schoolError = { code: 'PGRST003', message: 'Simulated database unavailability' };
  assert.equal((await request('/auth/me')).status, 503);
  const login = await request('/auth/login', {
    method: 'POST', body: { email: state.user.email, password: 'test-password' },
  });
  assert.equal(login.status, 503);
  assert.equal(login.body.session, undefined);
});

test('/switch-school denies a suspended target without updating the profile', async () => {
  state.schools['school-b'].status = 'suspended';
  assertSuspended(await request('/auth/switch-school', { method: 'POST', body: { school_id: 'school-b' } }));
  assert.deepEqual(state.updates, []);
  assert.equal(state.profile.school_id, 'school-a');
});

test('/switch-school does not update the profile when target status is unavailable', async () => {
  state.schoolError = { code: 'PGRST003', message: 'Simulated database unavailability' };
  assert.equal((await request('/auth/switch-school', { method: 'POST', body: { school_id: 'school-b' } })).status, 503);
  assert.deepEqual(state.updates, []);
});

test('/switch-school invalidates the cached profile so the next API request uses the new school', async () => {
  assert.equal((await request('/private')).status, 200);
  assert.equal(getCachedProfile(state.user.id).school_id, 'school-a');

  const switched = await request('/auth/switch-school', { method: 'POST', body: { school_id: 'school-b' } });
  assert.equal(switched.status, 200);
  assert.equal(switched.body.school.id, 'school-b');
  const followingRequest = await request('/private');
  assert.equal(followingRequest.status, 200);
  assert.equal(followingRequest.body.user.school_id, 'school-b');
  assert.deepEqual(state.updates, [{ school_id: 'school-b' }]);
});

test('profile and password mutations reject suspension before changing any data', async () => {
  state.schools['school-a'].status = 'suspended';
  assertSuspended(await request('/auth/profile', { method: 'PUT', body: { phone: '0600000000' } }));
  assertSuspended(await request('/auth/profile/photo', { method: 'POST' }));
  assertSuspended(await request('/auth/change-password', {
    method: 'POST', body: { currentPassword: 'test-password', newPassword: 'next-password' },
  }));
  assert.deepEqual(state.updates, []);
  assert.equal(state.passwordUpdates, 0);
  assert.equal(state.signIns, 0);
});
