# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
npm install                # Install dependencies
npm run start:dev          # Run development server with hot reload (port 3007)
npm run build              # Build project
npm run test               # Run unit tests
npm run test:e2e           # Run E2E tests
npm run lint               # Lint and auto-fix
npm run format             # Format code with Prettier
```

For database setup:
```bash
docker compose up -d       # Start PostgreSQL
npm run migration:run      # Apply pending migrations
```

## Project Architecture

This is a monolithic NestJS backend using **Fastify** (not Express) with PostgreSQL and TypeORM. The project is organized into core infrastructure and feature modules.

### Directory Structure

```
src/
├── core/                  # Core infrastructure (always loaded)
│   ├── app/              # Root AppModule (imports all core + feature modules)
│   ├── config/           # Configuration service & validation (ConfigModule)
│   ├── database/         # TypeORM setup & DataSource (DatabaseModule)
│   ├── health/           # Health check endpoints (HealthModule)
│   └── throttler/        # Rate limiting (ThrottlerModule)
├── database/             # TypeORM CLI artifacts
│   └── migrations/       # Database migrations (generated, not hand-written)
├── modules/              # Feature modules (lazy-loaded, added to AppModule)
│   ├── auth/            # Authentication (controllers, services, strategies, guards, DTOs)
│   └── users/           # User management (entities, services)
├── shared/              # Cross-cutting utilities
│   ├── constants/       # App constants
│   ├── guards/          # Reusable Nest guards
│   ├── services/        # Shared service logic
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Helper functions
└── main.ts              # Bootstrap & Fastify configuration

test/
├── unit/                # Unit tests (*.spec.ts in src/)
├── integration/         # Integration tests
└── e2e/                 # End-to-end tests (*.e2e-spec.ts)
```

### Module Pattern

All feature modules follow this structure:
- `module.ts` — imports children, exports public API
- `controllers/` — HTTP handlers
- `services/` — Business logic
- `dtos/` — Request/response validation schemas
- `entities/` — TypeORM entities (if DB persistence)
- `guards/` — Route-level authorization
- `strategies/` — Auth strategies (Passport, etc.)

Core modules are imported in `AppModule` and made global via `@Global()` decorator where needed (ConfigModule, DatabaseModule).

## Development Workflow

### Adding a Feature Module

1. Generate scaffold:
   ```bash
   nest generate module modules/<feature>
   nest generate controller modules/<feature>
   nest generate service modules/<feature>
   ```
2. Create subdirectories as needed: `dtos/`, `entities/`, `guards/`, `strategies/`
3. Import the new module in `AppModule` under the "Application modules" section
4. Define entities, DTOs, services following the module pattern above

### Database Migrations

Migrations live in `src/database/migrations/` and are auto-generated from entity changes:

```bash
npm run migration:generate   # Create new migration from entity diffs
npm run migration:run        # Apply all pending migrations (also runs on app start if POSTGRES_MIGRATIONS_RUN=true)
npm run migration:revert     # Roll back the last migration
npm run migration:show       # List applied and pending migrations
```

**Important:** `POSTGRES_SYNCHRONIZE=false` by default. Do not rely on auto-sync; always create and apply migrations.

TypeORM CLI reads from `src/database/data-source.ts`. At runtime, NestJS reads the DataSource provided by `DatabaseModule`.

### Using the Database in Modules

1. Import `TypeOrmModule.forFeature([YourEntity])` in the module
2. Inject repository: `@InjectRepository(YourEntity) private repo: Repository<YourEntity>`
3. For transactions, use `@Transactional()` decorator from `typeorm-transactional` (context initialized in `main.ts`)

## Key Configuration

Environment variables are validated via Joi schema in `src/core/config/config.validation.ts` and typed in `src/core/config/config.types.ts`. Inject via `ConfigService`:

```typescript
constructor(private config: ConfigService) {}

const port = this.config.get('PORT');
```

**Standard variables:**
- `PORT` — HTTP server port (default: 3007)
- `NODE_ENV` — development or production
- `COOKIE_SECRET` — Fastify cookie plugin secret
- `POSTGRES_*` — Database credentials and options
- `HEALTH_CHECK_ENABLED` — Toggle health endpoint
- `THROTTLE_GLOBAL_*` — Rate limit TTL and requests per window

## Fastify Configuration

The app is bootstrapped in `src/main.ts` using `NestFastifyApplication`. Key plugins registered:
- `@fastify/compress` — Gzip compression
- `@fastify/cookie` — Cookie parsing and signing

Use Fastify types and methods in custom code (`app.register(...)`, access via `@Req() req: FastifyRequest`), not Express.

CORS is pre-configured for localhost development ports (5174, 4200, 8080).

## Testing

- **Unit tests:** `src/**/*.spec.ts` — run with `npm run test`
- **Integration tests:** `test/integration/` 
- **E2E tests:** `test/**/*.e2e-spec.ts` — run with `npm run test:e2e`

Jest is configured with ts-jest transformer. Coverage reports go to `coverage/`.

Watch mode: `npm run test:watch`
Debug mode: `npm run test:debug`

## Code Style

- **Imports:** Use `@/*` alias (configured in `tsconfig.json`). Example: `import { ConfigService } from '@/core/config/config.service'`
- **Format:** Run `npm run format` before committing (Prettier auto-formats)
- **Lint:** ESLint (flat config) auto-fixes on `npm run lint`
- **Patterns:** Follow NestJS conventions: dependency injection, providers, guards, interceptors

## Key Libraries

| Purpose          | Package                    | Usage                                           |
|------------------|----------------------------|-------------------------------------------------|
| HTTP Framework   | @nestjs/platform-fastify   | NestFastifyApplication, FastifyRequest/Response |
| Validation       | class-validator, joi       | DTOs (class-validator), config (joi)            |
| Database         | typeorm, @nestjs/typeorm   | Entity definitions, repositories                |
| Transactions     | typeorm-transactional      | @Transactional() decorator                      |
| Rate Limiting    | @nestjs/throttler          | Global throttle guard                           |
| Config           | @nestjs/config             | Environment variable management                 |
| Health Checks    | @nestjs/terminus           | Liveness/readiness probes                       |

## Common Tasks

### Run the app locally
```bash
npm run start:dev     # Watch mode
npm run start:prod    # Production build + run
npm run start:debug   # Debug mode with inspector
```

### Testing a single file
```bash
npm run test -- users.service.spec.ts
npm run test -- --testPathPattern=users
```

### Debug a test
```bash
npm run test:debug    # Breakpoints in src/**/*.spec.ts
```

### Generate code
```bash
nest generate module modules/<name>
nest generate controller modules/<name>
nest generate service modules/<name>
```

## Notes for Future Development

- The monolith structure makes it easy to add cross-module features (shared auth guards, transactional operations across services)
- All feature modules are imported in AppModule; avoid circular dependencies by organizing by concern (auth, users, etc.) rather than by layer
- Transactional context is initialized globally in `main.ts`; `@Transactional()` works across any injected service
- Health checks and throttler are pre-wired but disabled/tuned via config — enable as needed
