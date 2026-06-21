import { ObjectId } from '../../../database/object-id';
import type {
  CreateStatusIncidentInput,
  StatusIncidentDetailDto,
  StatusIncidentDto,
  StatusIncidentRecord,
  StatusIncidentTimelineEntryDto,
  StatusServiceRecord,
  UpdateStatusIncidentInput,
} from '../types/status-page.types';
import * as incidentRepo from '../repositories/incident.repository';
import * as serviceRepo from '../repositories/service.repository';

const toDto = (
  incident: StatusIncidentRecord,
  service: StatusServiceRecord,
): StatusIncidentDto => ({
  id: String(incident._id),
  serviceId: String(incident.serviceId),
  serviceKey: service.key,
  serviceName: service.name,
  title: incident.title,
  slug: incident.slug,
  status: incident.status,
  severity: incident.severity,
  description: incident.description,
  publicMessage: incident.publicMessage,
  startedAt: incident.startedAt.toISOString(),
  resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : null,
  isPublic: incident.isPublic,
  createdAt: incident.createdAt.toISOString(),
  updatedAt: incident.updatedAt.toISOString(),
});

const incidentStatusLabels: Record<StatusIncidentRecord['status'], string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};

const buildIncidentTimeline = (
  incident: StatusIncidentRecord,
): StatusIncidentTimelineEntryDto[] => {
  const entries: StatusIncidentTimelineEntryDto[] = [
    {
      status: 'investigating',
      label: incidentStatusLabels.investigating,
      at: incident.startedAt.toISOString(),
      description: incident.publicMessage || incident.description,
    },
  ];

  if (
    incident.status !== 'investigating' &&
    incident.status !== 'resolved' &&
    incident.updatedAt.getTime() > incident.startedAt.getTime()
  ) {
    entries.push({
      status: incident.status,
      label: incidentStatusLabels[incident.status],
      at: incident.updatedAt.toISOString(),
    });
  }

  if (incident.resolvedAt) {
    entries.push({
      status: 'resolved',
      label: incidentStatusLabels.resolved,
      at: incident.resolvedAt.toISOString(),
    });
  }

  return entries;
};

const toDetailDto = (
  incident: StatusIncidentRecord,
  service: StatusServiceRecord,
): StatusIncidentDetailDto => {
  const base = toDto(incident, service);
  const durationMinutes = incident.resolvedAt
    ? Math.max(
        0,
        Math.round(
          (incident.resolvedAt.getTime() - incident.startedAt.getTime()) / 60_000,
        ),
      )
    : null;

  return {
    ...base,
    description: incident.description || incident.publicMessage || '',
    affectedServices: [service.name],
    durationMinutes,
    timeline: buildIncidentTimeline(incident),
  };
};

export async function createIncident(input: CreateStatusIncidentInput, createdBy: string | null) {
  const service = await serviceRepo.findServiceByKey(input.serviceKey);
  if (!service || !service.isActive) {
    throw new Error(`Service '${input.serviceKey}' not found or inactive`);
  }

  const createdById =
    createdBy && ObjectId.isValid(createdBy) ? new ObjectId(createdBy) : null;

  const incident = await incidentRepo.insertIncident(service._id, input, createdById);
  return toDto(incident, service);
}

export async function updateIncident(id: string, patch: UpdateStatusIncidentInput) {
  const existing = await incidentRepo.findIncidentById(id);
  if (!existing) return null;

  const updated = await incidentRepo.updateIncidentById(id, patch);
  if (!updated) return null;

  const service = await serviceRepo.findServiceById(updated.serviceId);
  if (!service) return null;
  return toDto(updated, service);
}

export async function resolveIncident(id: string) {
  const existing = await incidentRepo.findIncidentById(id);
  if (!existing) return null;
  if (existing.status === 'resolved' && existing.resolvedAt) {
    const service = await serviceRepo.findServiceById(existing.serviceId);
    return service ? toDto(existing, service) : null;
  }

  const resolved = await incidentRepo.resolveIncidentById(id);
  if (!resolved) return null;
  const service = await serviceRepo.findServiceById(resolved.serviceId);
  if (!service) return null;
  return toDto(resolved, service);
}

export async function getPublicIncidentBySlug(slug: string) {
  const incident = await incidentRepo.findIncidentBySlug(slug, true);
  if (!incident) return null;
  const service = await serviceRepo.findServiceById(incident.serviceId);
  if (!service || !service.isPublic) return null;
  return toDetailDto(incident, service);
}

export async function listPublicIncidents(page: number, limit: number) {
  const { items, total } = await incidentRepo.listPublicIncidents(page, limit);
  const serviceIds = [...new Set(items.map((i) => String(i.serviceId)))];
  const services = await Promise.all(serviceIds.map((id) => serviceRepo.findServiceById(id)));
  const serviceMap = new Map(
    services.filter(Boolean).map((s) => [String(s!._id), s!]),
  );

  const data = items
    .map((incident) => {
      const service = serviceMap.get(String(incident.serviceId));
      if (!service) return null;
      return toDto(incident, service);
    })
    .filter(Boolean) as StatusIncidentDto[];

  return { data, total };
}

export async function mapIncidentsToDtos(incidents: StatusIncidentRecord[]) {
  const serviceIds = [...new Set(incidents.map((i) => String(i.serviceId)))];
  const services = await Promise.all(serviceIds.map((id) => serviceRepo.findServiceById(id)));
  const serviceMap = new Map(
    services.filter(Boolean).map((s) => [String(s!._id), s!]),
  );

  return incidents
    .map((incident) => {
      const service = serviceMap.get(String(incident.serviceId));
      if (!service) return null;
      return toDto(incident, service);
    })
    .filter(Boolean) as StatusIncidentDto[];
}
