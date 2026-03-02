# mipit-adapter-spei

MiPIT PoC — SPEI rail adapter (consumer/worker).

Consumes canonical payment messages from RabbitMQ, translates them to SPEI payload format, calls the sandbox/mock SPEI endpoint, handles retries with exponential backoff, normalizes the response, and publishes the acknowledgment back to the core.

## Flow

```
Core → RabbitMQ (payments.route.spei) → adapter-spei → sandbox/mock SPEI → ack → RabbitMQ (ack.spei) → Core
```

## Quick Start

```bash
cp .env.example .env
npm install
npm run dev      # Start worker with hot reload
npm run mock     # Start mock SPEI sandbox on port 9002
```

## Scripts

| Script          | Description                        |
|-----------------|------------------------------------|
| `npm run dev`   | Start worker with tsx watch        |
| `npm run build` | Compile TypeScript                 |
| `npm start`     | Run compiled worker                |
| `npm run mock`  | Start embedded SPEI mock sandbox   |
| `npm run lint`  | Run ESLint                         |
| `npm run format`| Format with Prettier               |
| `npm test`      | Run Jest tests                     |

## Environment Variables

See [`.env.example`](.env.example) for all required configuration.

## Docker

```bash
docker build -t mipit-adapter-spei .
docker run --env-file .env mipit-adapter-spei
```
