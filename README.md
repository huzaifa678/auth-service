# Auth Service

![Status: In Development](https://img.shields.io/badge/Status-In%20Development-blue)
![Node.js](https://img.shields.io/badge/Node.js-22+-brightgreen)
![Express](https://img.shields.io/badge/Express-5-black)
![GraphQL](https://img.shields.io/badge/GraphQL-Apollo%20Server-pink)

A Node.js microservice that handles user authentication for the SaaS platform. It exposes a **GraphQL API** for registration, login, token refresh, and logout, backed by **PostgreSQL** via Prisma ORM.

## Architecture

```mermaid
graph TD
    A["Client"] -->|GraphQL POST /api/auth| B["Auth Service\nPort 8080"]

    B --> C["Controller Layer\nJWT middleware + Apollo execution"]

    C --> D["Resolver Layer\nGraphQL operations"]

    D --> E["Service Layer\nBusiness logic + Circuit Breaker"]

    E --> F["DAO Layer\nData access"]

    F -->|Prisma| G["PostgreSQL\nAuth DB"]

    B -->|Metrics| H["Prometheus\nPort 4001"]

    E -->|Trace & Log| I["OpenTelemetry + Winston\nObservability Stack"]

    style A fill:#FFE66D,stroke:#333,color:#333,stroke-width:2px
    style B fill:#4ECDC4,stroke:#333,color:#fff,stroke-width:3px
    style C fill:#FFA07A,stroke:#333,color:#fff,stroke-width:2px
    style D fill:#FF6B6B,stroke:#333,color:#fff,stroke-width:2px
    style E fill:#FFD700,stroke:#333,color:#333,stroke-width:2px
    style F fill:#98D8C8,stroke:#333,color:#333,stroke-width:2px
    style G fill:#6C63FF,stroke:#333,color:#fff,stroke-width:2px
    style H fill:#95E1D3,stroke:#333,color:#333,stroke-width:2px
    style I fill:#FF8B94,stroke:#333,color:#fff,stroke-width:2px
```

## Tech Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js 22 (ESM) |
| Framework | Express 5 |
| API | GraphQL (Apollo Server 5) |
| Database | PostgreSQL (Prisma ORM) |
| Auth | JWT (access + refresh tokens), bcrypt |
| Resilience | Opossum circuit breaker |
| Observability | OpenTelemetry (traces + logs), Winston |
| Metrics | Prometheus (prom-client) |
| Testing | Jest + Supertest |
| Package manager | pnpm |

## Features

- **GraphQL API** — register, login, refresh token, logout, and `me` query via `/api/auth`
- **JWT auth** — short-lived access tokens (`15m`) + long-lived refresh tokens (`7d`)
- **Circuit breaker** — wraps login and refresh token operations with Opossum
- **OpenTelemetry** — distributed tracing and log export via OTLP HTTP
- **Prometheus metrics** — exposed on a dedicated port `4001`
- **Health endpoints** — `GET /healthz/live` and `GET /healthz/ready`
- **Graceful shutdown** — handles `SIGINT`, `SIGTERM`, `SIGHUP`, `SIGQUIT`

## Project Structure

```
auth-service/
├── src/
│   ├── controller/          # Express router + JWT middleware + Apollo execution
│   ├── resolvers/           # GraphQL resolvers
│   ├── schema/              # GraphQL type definitions
│   ├── service/             # Business logic + circuit breaker wiring
│   ├── models/
│   │   ├── dao/             # Prisma data access objects
│   │   └── dto/             # Input/output types
│   └── db/                  # Prisma client setup
├── prisma/
│   ├── schema.prisma        # Database schema (User, RefreshToken)
│   └── migrations/          # Prisma migration files
├── __tests__/               # Unit + integration tests
├── index.js                 # Application entry point
├── logger.js                # Winston logger
├── tracing.js               # OpenTelemetry bootstrap
└── Dockerfile
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm
- PostgreSQL

### Environment Variables

Create a `.env` file in `auth-service/`:

```env
PORT=8080
DATABASE_URL=postgresql://auth_user:password@localhost:5432/auth_db
JWT_SECRET=supersecret
JWT_REFRESH_SECRET=superrefresh
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://localhost:4318/v1/logs
OTEL_SERVICE_NAME=auth-service
```

### Install & Run

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm migrate

# Start in development mode
pnpm dev

# Start in production mode
pnpm start
```

### Testing

```bash
# Run tests with coverage
pnpm test
```

## API

### GraphQL

Endpoint: `POST http://localhost:8080/api/auth`

Apollo Sandbox available at `http://localhost:8080/api/auth` in dev mode.

**Register:**

```graphql
mutation {
  register(email: "user@example.com", password: "secret") {
    id
    email
    createdAt
  }
}
```

**Login:**

```graphql
mutation {
  login(email: "user@example.com", password: "secret") {
    accessToken
    refreshToken
    user { id email }
  }
}
```

**Refresh Token:**

```graphql
mutation {
  refreshToken(token: "<refresh_token>") {
    accessToken
    refreshToken
    user { id email }
  }
}
```

**Logout:**

```graphql
mutation {
  logout(token: "<refresh_token>")
}
```

**Me (requires `Authorization: Bearer <access_token>` header):**

```graphql
query {
  me {
    id
    email
    createdAt
  }
}
```

## Database Schema

| Model | Fields |
|---|---|
| `User` | `id`, `email` (unique), `password` (hashed), `createdAt` |
| `RefreshToken` | `id`, `token` (unique), `userId`, `expiresAt`, `createdAt` |

## Docker

```bash
docker build -t auth-service .
docker run -p 8080:8080 -p 4001:4001 --env-file .env auth-service
```

## CI/CD

GitHub Actions workflows are in `.github/workflows/`:

- `auth-service-ci.yml` — install, generate Prisma client, test, lint, build & push Docker image to ECR, update ArgoCD `values-dev.yaml` on push to `dev`
- `auth-service-cd.yml` — retag SHA image as `prod` in ECR, update ArgoCD `values-prod.yaml` on PR merge to `main`
- `test.yml` — standalone test runner

## License

MIT
