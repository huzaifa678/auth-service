# Refactoring Notes — auth-service

This document records the SOLID/clean-code refactor of the auth-service, the
violations that existed before, why each one mattered, and how it was fixed.

All public exports were preserved, so the existing test suite (15 tests) keeps
passing and nothing downstream had to change.

## New module layout

| Module | Responsibility |
|--------|----------------|
| `src/config/auth.config.js` | Single source of truth for env reads, JWT secrets/TTLs, breaker tuning, refresh-token lifetime |
| `src/metrics/auth.metrics.js` | All Prometheus counters, grouped |
| `src/service/token.service.js` | JWT signing/verification (`issueTokenPair`, `verifyAccessToken`, `verifyRefreshToken`) |
| `src/middleware/auth.middleware.js` | The `authenticate` Express middleware |
| `src/graphql/apollo.server.js` | Builds & starts a single Apollo server for the process |
| `src/service/auth.service.js` | Orchestration only (login / refresh / register) |
| `src/controller/auth.controller.js` | HTTP transport only |

---

## 1. SRP — `auth.service.js` did six unrelated jobs

The original module defined Prometheus counters, signed JWTs, read
`process.env`, hardcoded a magic number, ran the business rules, **and** wired
the circuit breakers. Six reasons to change one file; impossible to unit-test in
isolation (importing it created counters and read env as a side effect).

### Before

```js
// auth.service.js
import promClient from 'prom-client';
const { sign, verify } = jwt;

// (a) metrics defined inline
const loginSuccessCounter = new promClient.Counter({ name: 'auth_login_success_total', help: '...' });
const loginFailureCounter = new promClient.Counter({ name: 'auth_login_failure_total', help: '...' });
// ...4 more counters...

const loginHandler = async ({ email, password }) => {
  const dto = new LoginDTO({ email, password });
  const user = await UserDAO.findByEmail(dto.email);
  if (!user) { loginFailureCounter.inc(); throw new Error('Invalid username credential'); }

  const valid = await bcrypt.compare(dto.password, user.password);
  if (!valid) { loginFailureCounter.inc(); throw new Error('Invalid password credential'); }

  // (b) JWT signing inline, (c) process.env inline, (d) magic number inline
  const accessToken  = sign({ userId: user.id }, process.env.JWT_SECRET,         { expiresIn: process.env.ACCESS_TOKEN_TTL });
  const refreshToken = sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.REFRESH_TOKEN_TTL });

  await RefreshTokenDAO.create({
    token: refreshToken,
    userId: user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // magic number
  });
  loginSuccessCounter.inc();
  return { accessToken, refreshToken, user };
};
```

### After

```js
// metrics/auth.metrics.js  — instrumentation lives here
export const authMetrics = {
  loginSuccess: new promClient.Counter({ name: 'auth_login_success_total', help: '...' }),
  loginFailure: new promClient.Counter({ name: 'auth_login_failure_total', help: '...' }),
  /* ...the rest... */
};

// config/auth.config.js  — env + magic numbers live here
export const jwtConfig = {
  accessSecret: process.env.JWT_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL,
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL,
};
export const refreshTokenExpiryDate = () => new Date(Date.now() + 7 * DAY_IN_MS);

// service/auth.service.js  — orchestration only
const loginHandler = async ({ email, password }) => {
  const { email: validEmail, password: validPassword } = new LoginDTO({ email, password });

  const user = await UserDAO.findByEmail(validEmail);
  if (!user) { authMetrics.loginFailure.inc(); throw new Error('Invalid username credential'); }

  const passwordMatches = await bcrypt.compare(validPassword, user.password);
  if (!passwordMatches) { authMetrics.loginFailure.inc(); throw new Error('Invalid password credential'); }

  const { accessToken, refreshToken } = TokenService.issueTokenPair(user.id);
  await persistRefreshToken(refreshToken, user.id);

  authMetrics.loginSuccess.inc();
  return { accessToken, refreshToken, user };
};
```

---

## 2. DRY + DIP — JWT signing duplicated 4×, direct `process.env`

The same `sign(...)` pattern appeared four times across login and refresh. Worse
than duplication: the secret+TTL pairing was a rule re-implemented each time, so
signing a refresh token with the access secret was one typo away. High-level auth
policy also depended directly on the low-level `process.env` global (DIP).

### Before

```js
const accessToken  = sign({ userId: user.id },      process.env.JWT_SECRET,         { expiresIn: process.env.ACCESS_TOKEN_TTL });
const refreshToken = sign({ userId: user.id },      process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.REFRESH_TOKEN_TTL });
// ...and again in refreshTokenHandler:
const accessToken  = sign({ userId: payload.userId }, process.env.JWT_SECRET,         { expiresIn: process.env.ACCESS_TOKEN_TTL });
const refreshToken = sign({ userId: payload.userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.REFRESH_TOKEN_TTL });
```

### After

```js
// service/token.service.js — one home for token crypto, depends on jwtConfig
export const TokenService = {
  signAccessToken(userId)  { return sign({ userId }, jwtConfig.accessSecret,  { expiresIn: jwtConfig.accessTokenTtl }); },
  signRefreshToken(userId) { return sign({ userId }, jwtConfig.refreshSecret, { expiresIn: jwtConfig.refreshTokenTtl }); },
  issueTokenPair(userId)   { return { accessToken: this.signAccessToken(userId), refreshToken: this.signRefreshToken(userId) }; },
  verifyAccessToken(token)  { return verify(token, jwtConfig.accessSecret); },
  verifyRefreshToken(token) { return verify(token, jwtConfig.refreshSecret); },
};
```

---

## 3. SRP + correctness — controller rebuilt Apollo on every request

The POST handler built the schema, constructed a new `ApolloServer`, and called
`server.start()` **inside the request path, on every request**. This mixed
transport, schema construction, and server lifecycle — and was a real
performance/correctness bug. The SRP fix (build once) was also the bug fix.

### Before

```js
router.post('/', async (req, res) => {
  const span = tracer.startSpan('AuthGraphQLOperation', undefined, ctx);
  try {
    const schema = makeExecutableSchema({ typeDefs, resolvers });   // every request
    const server = new ApolloServer({ schema, plugins: [...] });    // every request
    await server.start();                                           // every request
    const { query, variables } = req.body;
    const result = await context.with(trace.setSpan(ctx, span), async () =>
      server.executeOperation({ query, variables, context: { userId: req.userId } }));
    res.json(result);
  } finally { span.end(); }
});
```

### After

```js
// graphql/apollo.server.js — built once at boot
const schema = makeExecutableSchema({ typeDefs, resolvers });
const apolloServer = new ApolloServer({ schema, plugins: [ApolloServerPluginLandingPageLocalDefault()] });
await apolloServer.start();
export { apolloServer };

// controller/auth.controller.js — thin request path
router.use(authenticate);
router.post('/', async (req, res) => {
  const span = tracer.startSpan('AuthGraphQLOperation', undefined, parentContext);
  try {
    const { query, variables } = req.body;
    const result = await context.with(trace.setSpan(parentContext, span), () =>
      apolloServer.executeOperation({ query, variables, context: { userId: req.userId } }));
    res.json(result);
  } finally { span.end(); }
});
```

---

## 4. SRP — inlined auth middleware extracted

JWT verification was baked into the router. The transport layer should not know
*how* authentication works.

### Before

```js
router.use((req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  req.userId = null;
  if (token) {
    try { req.userId = jwt.verify(token, process.env.JWT_SECRET).userId; }
    catch (e) { logger.warn('Invalid token', { error: e.message, path: req.path, service: 'auth-service' }); }
  }
  next();
});
```

### After

```js
// middleware/auth.middleware.js
export const authenticate = (req, _res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith(BEARER_PREFIX) ? authHeader.slice(BEARER_PREFIX.length) : '';
  req.userId = null;
  if (token) {
    try { req.userId = TokenService.verifyAccessToken(token).userId; }
    catch (error) { logger.warn('Invalid token', { error: error.message, path: req.path, service: 'auth-service' }); }
  }
  next();
};
```

---

## 5. Bonus bug fix — `/metrics` endpoint

The `/metrics` handler had a broken signature (`async (res)` — missing `req`)
and was mounted on the main `app` instead of the dedicated `metricsApp` that
listens on the metrics port (4001). It now lives on `metricsApp` with the
correct `(req, res)` signature.

---

## Outcome

- Each module now has a single, testable reason to change.
- Token crypto, metrics, config, and transport are independently swappable.
- All 15 existing tests pass; ESLint is clean; the app boots.
