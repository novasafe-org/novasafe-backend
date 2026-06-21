import type { ObjectId } from '../../../database/object-id';
import type {
  DailySnapshotStatus,
  IncidentSeverity,
  OperationalStatus,
  StatusIncidentRecord,
} from '../types/status-page.types';
import {
  addUtcDays,
  endOfUtcDay,
  formatDateKey,
  startOfUtcDay,
} from '../utils/status-page.util';
import * as incidentRepo from '../repositories/incident.repository';
import * as historyRepo from '../repositories/status-history.repository';

const MS_PER_SECOND = 1000;

export const incidentEffectiveEnd = (incident: StatusIncidentRecord, windowEnd: Date): Date => {
  const resolved = incident.resolvedAt ?? windowEnd;
  return resolved.getTime() > windowEnd.getTime() ? windowEnd : resolved;
};

export const incidentEffectiveStart = (incident: StatusIncidentRecord, windowStart: Date): Date => {
  return incident.startedAt.getTime() < windowStart.getTime() ? windowStart : incident.startedAt;
};

/** Overlap duration in seconds between incident and [windowStart, windowEnd]. */
export const overlapSeconds = (
  incident: StatusIncidentRecord,
  windowStart: Date,
  windowEnd: Date,
): number => {
  const start = incidentEffectiveStart(incident, windowStart);
  const end = incidentEffectiveEnd(incident, windowEnd);
  if (end.getTime() <= start.getTime()) return 0;
  return (end.getTime() - start.getTime()) / MS_PER_SECOND;
};

/** Weight for uptime impact — maintenance excluded (0), degraded/major count fully. */
export const severityImpactWeight = (severity: IncidentSeverity): number => {
  if (severity === 'maintenance') return 0;
  return 1;
};

export const calculateUptimePercentage = (
  incidents: StatusIncidentRecord[],
  windowStart: Date,
  windowEnd: Date,
): number => {
  const totalSeconds = Math.max(1, (windowEnd.getTime() - windowStart.getTime()) / MS_PER_SECOND);
  let downtimeSeconds = 0;

  for (const incident of incidents) {
    const weight = severityImpactWeight(incident.severity);
    if (weight === 0) continue;
    downtimeSeconds += overlapSeconds(incident, windowStart, windowEnd) * weight;
  }

  const uptime = ((totalSeconds - Math.min(downtimeSeconds, totalSeconds)) / totalSeconds) * 100;
  return Math.round(Math.max(0, Math.min(100, uptime)) * 100) / 100;
};

export const worstStatusFromIncidents = (
  incidents: StatusIncidentRecord[],
): OperationalStatus => {
  let status: OperationalStatus = 'operational';
  for (const incident of incidents) {
    if (incident.severity === 'maintenance') continue;
    if (incident.severity === 'major') return 'major';
    if (incident.severity === 'degraded') status = 'degraded';
  }
  return status;
};

export const deriveOperationalStatus = (activeIncidents: StatusIncidentRecord[]): OperationalStatus => {
  const impacting = activeIncidents.filter((i) => i.severity !== 'maintenance');
  if (impacting.length === 0) return 'operational';
  return worstStatusFromIncidents(impacting);
};

export async function computeUptimeForService(
  serviceId: ObjectId,
  hours: number,
): Promise<number> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - hours * 60 * 60 * 1000);
  const incidents = await incidentRepo.findIncidentsOverlappingWindow(serviceId, windowStart, windowEnd);
  return calculateUptimePercentage(incidents, windowStart, windowEnd);
}

export async function getUptimeSummary(serviceId: ObjectId) {
  const [last24Hours, last30Days, last90Days] = await Promise.all([
    computeUptimeForService(serviceId, 24),
    computeUptimeForService(serviceId, 24 * 30),
    computeUptimeForService(serviceId, 24 * 90),
  ]);
  return { last24Hours, last30Days, last90Days };
}

export async function buildDailySnapshot(
  serviceId: ObjectId,
  day: Date,
): Promise<{ status: DailySnapshotStatus; uptimePercentage: number }> {
  const windowStart = startOfUtcDay(day);
  const windowEnd = endOfUtcDay(day);
  const incidents = await incidentRepo.findIncidentsOverlappingWindow(serviceId, windowStart, windowEnd);
  const uptimePercentage = calculateUptimePercentage(incidents, windowStart, windowEnd);

  const activeOnDay = incidents.filter((i) => i.severity !== 'maintenance');
  let status: DailySnapshotStatus = 'operational';
  if (activeOnDay.some((i) => i.severity === 'major')) status = 'major';
  else if (activeOnDay.some((i) => i.severity === 'degraded')) status = 'degraded';

  return { status, uptimePercentage };
}

export async function ensureSnapshotsForRange(serviceId: ObjectId, days: number): Promise<void> {
  const today = startOfUtcDay(new Date());
  for (let i = 0; i < days; i += 1) {
    const day = addUtcDays(today, -i);
    const dateKey = formatDateKey(day);
    const existing = await historyRepo.findSnapshot(serviceId, dateKey);
    if (existing && i > 0) continue;

    const snapshot = await buildDailySnapshot(serviceId, day);
    await historyRepo.upsertSnapshot(serviceId, dateKey, snapshot.status, snapshot.uptimePercentage);
  }
}

export async function getHistoryForService(serviceId: ObjectId, days: number) {
  await ensureSnapshotsForRange(serviceId, days);
  const today = startOfUtcDay(new Date());
  const from = addUtcDays(today, -(days - 1));
  return historyRepo.findSnapshotsInRange(serviceId, formatDateKey(from), formatDateKey(today));
}
