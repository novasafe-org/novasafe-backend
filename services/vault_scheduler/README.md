# Vault Scheduler Service

Background job scheduler for NovaSafe vault operations. This service handles all scheduled and background tasks decoupled from the API services.

## Features

- **Standalone Service**: Runs independently from API services
- **BullMQ Integration**: Uses Redis-based queue for job management
- **Extensible Architecture**: Easy to add new jobs
- **Production-Ready**: Idempotent jobs, retry logic, structured logging

## Current Jobs

### Soft Delete Cleanup
- **Purpose**: Permanently deletes items that have been in trash for more than 30 days
- **Schedule**: Configurable (default: hourly)
- **Retention**: 30 days (configurable)

## Future Jobs (Designed for)

- Secret expiry
- Token rotation
- Trial expiration
- Session cleanup
- Audit log retention
- Notification dispatch

## Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Redis (via Docker)
- MongoDB connection

## Installation

1. Install dependencies:
```bash
cd services/vault_scheduler
pnpm install
```

2. Copy environment file:
```bash
cp env.example .env
```

3. Configure environment variables in `.env`

## Running

### From Root Directory (Recommended)
```bash
pnpm run start:scheduler
```

This will:
- Check if Redis container is running
- Start Redis container if needed
- Install dependencies if needed
- Start the scheduler service

### From Service Directory
```bash
cd services/vault_scheduler
pnpm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password (optional) | - |
| `REDIS_DB` | Redis database number | `0` |
| `MONGODB_URI` | MongoDB connection string | Required |
| `MONGODB_DATABASE` | Database name | `vault` |
| `SOFT_DELETE_CLEANUP_ENABLED` | Enable soft-delete cleanup job | `true` |
| `SOFT_DELETE_CLEANUP_INTERVAL` | Cron expression for cleanup job | `0 * * * *` (hourly) |
| `SOFT_DELETE_RETENTION_DAYS` | Days before permanent deletion | `30` |
| `LOG_LEVEL` | Logging level | `info` |

## Architecture

```
services/vault_scheduler/
├── src/
│   ├── jobs/              # Job implementations
│   │   ├── softDeleteCleanup.job.ts
│   │   └── index.ts
│   ├── queues/            # BullMQ queue configuration
│   │   └── scheduler.queue.ts
│   ├── workers/           # BullMQ worker
│   │   └── scheduler.worker.ts
│   ├── config/            # Configuration
│   │   └── scheduler.config.ts
│   ├── db/                # Database connection
│   │   └── connection.ts
│   ├── logger/            # Logging
│   │   └── index.ts
│   └── index.ts           # Entry point
├── package.json
└── tsconfig.json
```

## Adding New Jobs

1. Create job file in `src/jobs/`:
```typescript
// src/jobs/myNewJob.job.ts
import { Job } from 'bullmq';
import logger from '../logger';

export const myNewJob = async (data: any): Promise<void> => {
  logger.info('Running my new job...');
  // Job logic here
};
```

2. Register in worker (`src/workers/scheduler.worker.ts`):
```typescript
case 'my_new_job':
  await myNewJob(job.data);
  break;
```

3. Register in scheduler (`src/index.ts`):
```typescript
await schedulerQueue.add(
  'my_new_job',
  {},
  {
    repeat: {
      pattern: '0 0 * * *', // Daily at midnight
    },
    jobId: 'my_new_job',
  }
);
```

## Monitoring

Jobs are logged with structured logging. Check logs for:
- Job start/completion
- Job failures and retries
- Items processed
- Execution duration

## Troubleshooting

### Redis Connection Issues
- Ensure Redis container is running: `docker ps | grep redis`
- Check Redis connection: `docker exec novasafe-redis redis-cli ping`

### MongoDB Connection Issues
- Verify `MONGODB_URI` is correct
- Ensure MongoDB is accessible from scheduler service

### Jobs Not Running
- Check if job is enabled in config
- Verify cron expression is valid
- Check worker logs for errors

