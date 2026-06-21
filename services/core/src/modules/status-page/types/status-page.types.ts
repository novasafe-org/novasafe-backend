import type { ObjectId } from '../../../database/object-id';

export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';

export type IncidentSeverity = 'maintenance' | 'degraded' | 'major';

export type OperationalStatus = 'operational' | 'degraded' | 'major';

export type DailySnapshotStatus = OperationalStatus;

export interface StatusServiceRecord {
  _id: ObjectId;
  key: string;
  name: string;
  description?: string;
  isPublic: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusIncidentRecord {
  _id: ObjectId;
  serviceId: ObjectId;
  title: string;
  slug: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  description?: string;
  publicMessage?: string;
  startedAt: Date;
  resolvedAt: Date | null;
  isPublic: boolean;
  createdBy: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusSnapshotRecord {
  _id: ObjectId;
  serviceId: ObjectId;
  date: string;
  status: DailySnapshotStatus;
  uptimePercentage: number;
  createdAt: Date;
}

export interface StatusServiceDto {
  id: string;
  key: string;
  name: string;
  description?: string;
  status: OperationalStatus;
  uptime: {
    last24Hours: number;
    last30Days: number;
    last90Days: number;
  };
}

export interface StatusIncidentDto {
  id: string;
  serviceId: string;
  serviceKey: string;
  serviceName: string;
  title: string;
  slug: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  description?: string;
  publicMessage?: string;
  startedAt: string;
  resolvedAt: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StatusIncidentTimelineEntryDto {
  status: IncidentStatus;
  label: string;
  at: string;
  description?: string;
}

export interface StatusIncidentDetailDto extends StatusIncidentDto {
  affectedServices: string[];
  durationMinutes: number | null;
  timeline: StatusIncidentTimelineEntryDto[];
}

export interface CreateStatusServiceInput {
  key: string;
  name: string;
  description?: string;
  isPublic?: boolean;
  isActive?: boolean;
}

export interface CreateStatusIncidentInput {
  serviceKey: string;
  title: string;
  severity: IncidentSeverity;
  description?: string;
  publicMessage?: string;
  status?: IncidentStatus;
  startedAt?: Date;
  isPublic?: boolean;
}

export interface UpdateStatusIncidentInput {
  title?: string;
  severity?: IncidentSeverity;
  description?: string;
  publicMessage?: string;
  status?: IncidentStatus;
  startedAt?: Date;
  isPublic?: boolean;
}

export interface StatusHistoryDayDto {
  date: string;
  status: DailySnapshotStatus;
  uptimePercentage: number;
}
