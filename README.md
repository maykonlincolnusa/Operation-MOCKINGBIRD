# Operation MOCKINGBIRD

Operation MOCKINGBIRD is a minimal microservices MVP for intelligent communication automation. It models conversation flows, users, campaigns, outbound messaging, analytics, and a micro-frontend shell.

## Architecture

- API Gateway/BFF: Express REST and GraphQL entry point with JWT auth, logging, rate limits, and request fan-out.
- Services: User, Flow, Messaging, Campaign, Analytics, and Auth services. Each service owns its database and exposes data through its API only.
- Messaging: RabbitMQ carries domain events and commands between services.
- Saga examples: Flow execution and campaign activation coordinate local transactions through events and compensating failure handlers.
- Frontend: React + TypeScript micro-frontends exposed as custom elements and composed by the shell app.

## Run Locally

Install dependencies:

```powershell
npm install --ignore-scripts
npm run build
npm test
```

The `--ignore-scripts` flag avoids a local Windows/OneDrive issue observed with the `esbuild` postinstall binary validation. Docker builds run in Linux containers and are not expected to need this workaround.

```powershell
docker compose up --build
```

Gateway:

```text
http://localhost:8080
```

Frontend shell:

```text
http://localhost:3000
```

RabbitMQ management:

```text
http://localhost:15672
```

Default credentials are defined in `docker-compose.yaml` for local development only.

## Service Ports

| Component | Port |
| --- | --- |
| Gateway | 8080 |
| Auth Service | 4000 |
| User Service | 4001 |
| Flow Service | 4002 |
| Messaging Service | 4003 |
| Campaign Service | 4004 |
| Analytics Service | 4005 |
| Shell App | 3000 |

## Add A New Channel

1. Create a new service under `services/<channel>-service`.
2. Implement `POST /send` with the channel-specific provider API.
3. Subscribe to `SendMessageCommand` from RabbitMQ.
4. Emit `MessageSent` and `MessageFailed` events using `@mockingbird/events`.
5. Register the service in `docker-compose.yaml` and route it through the gateway if it needs synchronous APIs.

## Scaling Notes

Each service can scale independently behind Docker Compose, Kubernetes Deployments, or any orchestrator. Keep service state in its private database and use RabbitMQ for async coordination. For Kubernetes, scale deployments with HPA based on CPU, queue depth, or custom metrics.

## Security And Observability

- JWT is issued by Auth Service and verified by the Gateway.
- Gateway propagates `x-user-id`, `x-tenant-id`, and `x-roles` headers to downstream services.
- Services expose `/healthz` and `/metrics`.
- Logs are structured JSON via Winston.
- RabbitMQ consumers use prefetch and dead-letter queues.
- Messaging and Analytics consumers record processed event IDs for basic idempotency.
- Secrets should move to a secret manager outside local development.

## Validation Status

- `npm run build`: passing for shared libs, gateway, all services, shell app, and all micro-frontends.
- `npm test`: passing for the current events library tests.
- `docker compose config --quiet`: passing. Docker may warn if the local user cannot read `~/.docker/config.json`.
- `npm audit`: registry audit endpoint failed in the current environment; prior install output reported 10 moderate transitive advisories. Avoid `npm audit fix --force` until dependency upgrades are reviewed because it may introduce breaking changes.
