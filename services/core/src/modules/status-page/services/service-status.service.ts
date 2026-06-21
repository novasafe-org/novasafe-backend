import type { StatusServiceDto, StatusServiceRecord } from '../types/status-page.types';
import * as serviceRepo from '../repositories/service.repository';
import * as incidentRepo from '../repositories/incident.repository';
import * as historyRepo from '../repositories/status-history.repository';
import {
  deriveOperationalStatus,
  getHistoryForService,
  getUptimeSummary,
} from './uptime.service';
import { mapIncidentsToDtos } from './incident.service';

const toServiceDto = async (service: StatusServiceRecord): Promise<StatusServiceDto> => {
  const activeIncidents = await incidentRepo.findActiveIncidents({
    serviceId: service._id,
    publicOnly: true,
  });
  const uptime = await getUptimeSummary(service._id);
  return {
    id: String(service._id),
    key: service.key,
    name: service.name,
    description: service.description,
    status: deriveOperationalStatus(activeIncidents),
    uptime,
  };
};

export async function getPublicStatusOverview() {
  const services = await serviceRepo.findAllServices({ publicOnly: true, activeOnly: true });
  const serviceDtos = await Promise.all(services.map((s) => toServiceDto(s)));

  const activeIncidents = await incidentRepo.findActiveIncidents({ publicOnly: true });
  const maintenance = activeIncidents.filter((i) => i.severity === 'maintenance');
  const outages = activeIncidents.filter((i) => i.severity !== 'maintenance');

  const overallStatus = deriveOperationalStatus(outages);

  const [activeIncidentDtos, maintenanceDtos] = await Promise.all([
    mapIncidentsToDtos(outages),
    mapIncidentsToDtos(maintenance),
  ]);

  return {
    overallStatus,
    services: serviceDtos,
    activeIncidents: activeIncidentDtos,
    scheduledMaintenance: maintenanceDtos,
    updatedAt: new Date().toISOString(),
  };
}

export async function listPublicServices() {
  const services = await serviceRepo.findAllServices({ publicOnly: true, activeOnly: true });
  return Promise.all(services.map((s) => toServiceDto(s)));
}

export async function getServiceHistory(serviceKey: string, days: number) {
  const service = await serviceRepo.findServiceByKey(serviceKey);
  if (!service || !service.isPublic || !service.isActive) {
    return null;
  }

  const boundedDays = Math.min(90, Math.max(1, days));
  const snapshots = await getHistoryForService(service._id, boundedDays);
  const uptime = await getUptimeSummary(service._id);
  const activeIncidents = await incidentRepo.findActiveIncidents({
    serviceId: service._id,
    publicOnly: true,
  });

  return {
    service: {
      id: String(service._id),
      key: service.key,
      name: service.name,
      status: deriveOperationalStatus(activeIncidents.filter((i) => i.severity !== 'maintenance')),
      uptime,
    },
    days: boundedDays,
    history: snapshots.map((s) => ({
      date: s.date,
      status: s.status,
      uptimePercentage: s.uptimePercentage,
    })),
  };
}

export async function registerService(input: Parameters<typeof serviceRepo.insertService>[0]) {
  const existing = await serviceRepo.findServiceByKey(input.key);
  if (existing) {
    throw new Error(`Service key '${input.key}' already exists`);
  }
  const created = await serviceRepo.insertService(input);
  return {
    id: String(created._id),
    key: created.key,
    name: created.name,
    description: created.description,
    isPublic: created.isPublic,
    isActive: created.isActive,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
}

export async function ensureStatusPageReady(): Promise<void> {
  await Promise.all([
    serviceRepo.ensureStatusServiceIndexes(),
    incidentRepo.ensureStatusIncidentIndexes(),
    historyRepo.ensureStatusSnapshotIndexes(),
  ]);
  await serviceRepo.seedDefaultStatusServices();
}
