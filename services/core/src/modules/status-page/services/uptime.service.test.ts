import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { StatusIncidentRecord } from '../types/status-page.types';
import {
  calculateUptimePercentage,
  deriveOperationalStatus,
  overlapSeconds,
  worstStatusFromIncidents,
} from '../services/uptime.service';

const baseIncident = (overrides: Partial<StatusIncidentRecord>): StatusIncidentRecord =>
  ({
    _id: overrides._id as any,
    serviceId: overrides.serviceId as any,
    title: 'Test',
    slug: 'test',
    status: 'investigating',
    severity: 'major',
    startedAt: new Date('2026-06-21T10:00:00.000Z'),
    resolvedAt: null,
    isPublic: true,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as StatusIncidentRecord;

describe('uptime.service', () => {
  it('returns 100% when no incidents overlap', () => {
    const start = new Date('2026-06-21T00:00:00.000Z');
    const end = new Date('2026-06-21T23:59:59.999Z');
    const pct = calculateUptimePercentage([], start, end);
    assert.equal(pct, 100);
  });

  it('subtracts major outage duration from uptime', () => {
    const start = new Date('2026-06-21T00:00:00.000Z');
    const end = new Date('2026-06-21T23:59:59.999Z');
    const incident = baseIncident({
      severity: 'major',
      startedAt: new Date('2026-06-21T12:00:00.000Z'),
      resolvedAt: new Date('2026-06-21T13:00:00.000Z'),
    });
    const pct = calculateUptimePercentage([incident], start, end);
    assert.ok(pct < 100);
    assert.ok(pct > 95);
  });

  it('ignores maintenance for uptime impact', () => {
    const start = new Date('2026-06-21T00:00:00.000Z');
    const end = new Date('2026-06-21T23:59:59.999Z');
    const incident = baseIncident({
      severity: 'maintenance',
      startedAt: new Date('2026-06-21T12:00:00.000Z'),
      resolvedAt: new Date('2026-06-21T18:00:00.000Z'),
    });
    const pct = calculateUptimePercentage([incident], start, end);
    assert.equal(pct, 100);
  });

  it('derives operational status from active incidents', () => {
    assert.equal(
      deriveOperationalStatus([
        baseIncident({ severity: 'degraded', status: 'monitoring' }),
      ]),
      'degraded',
    );
    assert.equal(
      deriveOperationalStatus([
        baseIncident({ severity: 'major', status: 'investigating' }),
      ]),
      'major',
    );
    assert.equal(
      deriveOperationalStatus([
        baseIncident({ severity: 'maintenance', status: 'identified' }),
      ]),
      'operational',
    );
  });

  it('computes overlap seconds within window', () => {
    const windowStart = new Date('2026-06-21T00:00:00.000Z');
    const windowEnd = new Date('2026-06-21T23:59:59.999Z');
    const incident = baseIncident({
      startedAt: new Date('2026-06-20T12:00:00.000Z'),
      resolvedAt: new Date('2026-06-21T06:00:00.000Z'),
    });
    const seconds = overlapSeconds(incident, windowStart, windowEnd);
    assert.equal(seconds, 6 * 60 * 60);
  });

  it('prefers major over degraded in worst status', () => {
    assert.equal(
      worstStatusFromIncidents([
        baseIncident({ severity: 'degraded' }),
        baseIncident({ severity: 'major' }),
      ]),
      'major',
    );
  });
});
