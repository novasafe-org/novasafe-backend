import '../../loadEnv';

import { ConnectionManager } from '../database';
import { ObjectId } from '../database/object-id';
import { logger } from '../shared/logger';
import { ensureStatusPageReady } from '../modules/status-page';
import * as incidentRepo from '../modules/status-page/repositories/incident.repository';
import * as serviceRepo from '../modules/status-page/repositories/service.repository';
import { ensureSnapshotsForRange } from '../modules/status-page/services/uptime.service';
import type { CreateStatusIncidentInput } from '../modules/status-page/types/status-page.types';

const SNAPSHOT_DAYS = 90;

async function seedIncidentIfMissing(
  serviceId: ObjectId,
  input: CreateStatusIncidentInput,
  resolvedAt: Date,
): Promise<'created' | 'skipped'> {
  const slugBase = input.title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const month = (input.startedAt ?? new Date()).toLocaleString('en-US', { month: 'long' }).toLowerCase();
  const year = (input.startedAt ?? new Date()).getFullYear();
  const expectedSlug = `${slugBase || 'incident'}-${month}-${year}`;

  if (await incidentRepo.findIncidentBySlug(expectedSlug)) {
    return 'skipped';
  }

  const incident = await incidentRepo.insertIncident(serviceId, input, null);
  await incidentRepo.resolveIncidentById(String(incident._id), resolvedAt);
  return 'created';
}

async function main(): Promise<void> {
  await ConnectionManager.getInstance().initialize();
  await ensureStatusPageReady();

  const service = await serviceRepo.findServiceByKey('api');
  if (!service) {
    throw new Error('Default API service was not seeded');
  }

  const now = new Date();

  const latencyStarted = new Date(now);
  latencyStarted.setUTCDate(latencyStarted.getUTCDate() - 3);
  latencyStarted.setUTCHours(8, 15, 0, 0);

  const latencyResolved = new Date(latencyStarted);
  latencyResolved.setUTCHours(11, 42, 0, 0);

  const outageStarted = new Date(now);
  outageStarted.setUTCDate(outageStarted.getUTCDate() - 7);
  outageStarted.setUTCHours(14, 2, 0, 0);

  const outageResolved = new Date(outageStarted);
  outageResolved.setUTCHours(15, 18, 0, 0);

  const samples: Array<{ input: CreateStatusIncidentInput; resolvedAt: Date }> = [
    {
      input: {
        serviceKey: 'api',
        title: 'Increased API latency',
        severity: 'degraded',
        publicMessage: 'Elevated response times on authentication and vault sync endpoints.',
        description:
          'We observed elevated p95 latency on core API routes after a database connection pool saturation event.',
        startedAt: latencyStarted,
        status: 'investigating',
        isPublic: true,
      },
      resolvedAt: latencyResolved,
    },
    {
      input: {
        serviceKey: 'api',
        title: 'Database connectivity issue',
        severity: 'major',
        publicMessage: 'The NovaSafe API was unavailable for a subset of requests.',
        description:
          'A misconfigured deployment caused health checks to fail on two API nodes until rollback completed.',
        startedAt: outageStarted,
        status: 'investigating',
        isPublic: true,
      },
      resolvedAt: outageResolved,
    },
  ];

  let created = 0;
  let skipped = 0;
  for (const sample of samples) {
    const result = await seedIncidentIfMissing(service._id, sample.input, sample.resolvedAt);
    if (result === 'created') created += 1;
    else skipped += 1;
  }

  await ensureSnapshotsForRange(service._id, SNAPSHOT_DAYS);

  logger.info('Status page demo seed finished', {
    incidentsCreated: created,
    incidentsSkipped: skipped,
    snapshotDays: SNAPSHOT_DAYS,
  });

  await ConnectionManager.getInstance().shutdown();
}

main().catch(async (error) => {
  logger.error('Status page seed failed', {
    err: error instanceof Error ? error.message : String(error),
  });
  try {
    await ConnectionManager.getInstance().shutdown();
  } catch {
    // ignore shutdown errors after failure
  }
  process.exit(1);
});
