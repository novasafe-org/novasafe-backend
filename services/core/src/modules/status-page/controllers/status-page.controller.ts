import type { Request, Response } from 'express';

import {
  createIncident,
  getPublicIncidentBySlug,
  listPublicIncidents,
  resolveIncident,
  updateIncident,
} from '../services/incident.service';
import {
  getPublicStatusOverview,
  getServiceHistory,
  listPublicServices,
  registerService,
} from '../services/service-status.service';
import type {
  CreateStatusIncidentInput,
  CreateStatusServiceInput,
  IncidentSeverity,
  IncidentStatus,
  UpdateStatusIncidentInput,
} from '../types/status-page.types';

const pagination = (req: Request) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  return { page, limit };
};

const isIncidentSeverity = (value: unknown): value is IncidentSeverity =>
  value === 'maintenance' || value === 'degraded' || value === 'major';

const isIncidentStatus = (value: unknown): value is IncidentStatus =>
  value === 'investigating' ||
  value === 'identified' ||
  value === 'monitoring' ||
  value === 'resolved';

export const getStatusOverview = async (_req: Request, res: Response): Promise<void> => {
  const data = await getPublicStatusOverview();
  res.status(200).json({ success: true, data });
};

export const getStatusServices = async (_req: Request, res: Response): Promise<void> => {
  const data = await listPublicServices();
  res.status(200).json({ success: true, data });
};

export const getStatusIncidents = async (req: Request, res: Response): Promise<void> => {
  const { page, limit } = pagination(req);
  const { data, total } = await listPublicIncidents(page, limit);
  res.status(200).json({
    success: true,
    pagination: { page, limit, total, hasNext: page * limit < total },
    data,
  });
};

export const getStatusIncidentBySlug = async (req: Request, res: Response): Promise<void> => {
  const incident = await getPublicIncidentBySlug(req.params.slug);
  if (!incident) {
    res.status(404).json({ success: false, message: 'Incident not found' });
    return;
  }
  res.status(200).json({ success: true, data: incident });
};

export const getStatusHistory = async (req: Request, res: Response): Promise<void> => {
  const serviceKey = String(req.query.serviceKey || req.query.service || 'api');
  const days = Number(req.query.days || 90);
  const history = await getServiceHistory(serviceKey, days);
  if (!history) {
    res.status(404).json({ success: false, message: 'Service not found' });
    return;
  }
  res.status(200).json({ success: true, data: history });
};

export const postAdminService = async (req: Request, res: Response): Promise<void> => {
  const body = req.body || {};
  const key = String(body.key || '').trim();
  const name = String(body.name || '').trim();
  if (!key || !name) {
    res.status(400).json({ success: false, message: 'key and name are required' });
    return;
  }

  const input: CreateStatusServiceInput = {
    key,
    name,
    description: body.description ? String(body.description) : undefined,
    isPublic: body.isPublic !== undefined ? Boolean(body.isPublic) : true,
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
  };

  try {
    const data = await registerService(input);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(409).json({
      success: false,
      message: err instanceof Error ? err.message : 'Unable to create service',
    });
  }
};

export const postAdminIncident = async (req: Request, res: Response): Promise<void> => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const serviceKey = String(body.serviceKey || body.service || 'api').trim();
  const severity = body.severity;

  if (!title) {
    res.status(400).json({ success: false, message: 'title is required' });
    return;
  }
  if (!isIncidentSeverity(severity)) {
    res.status(400).json({
      success: false,
      message: 'severity must be maintenance, degraded, or major',
    });
    return;
  }

  const input: CreateStatusIncidentInput = {
    serviceKey,
    title,
    severity,
    description: body.description ? String(body.description) : undefined,
    publicMessage: body.publicMessage ? String(body.publicMessage) : undefined,
    isPublic: body.isPublic !== undefined ? Boolean(body.isPublic) : true,
  };

  if (body.status !== undefined) {
    if (!isIncidentStatus(body.status)) {
      res.status(400).json({ success: false, message: 'Invalid incident status' });
      return;
    }
    input.status = body.status;
  }

  if (body.startedAt) {
    const startedAt = new Date(String(body.startedAt));
    if (Number.isNaN(startedAt.getTime())) {
      res.status(400).json({ success: false, message: 'Invalid startedAt date' });
      return;
    }
    input.startedAt = startedAt;
  }

  try {
    const data = await createIncident(input, req.user?.id ?? null);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Unable to create incident',
    });
  }
};

export const putAdminIncident = async (req: Request, res: Response): Promise<void> => {
  const patch: UpdateStatusIncidentInput = {};
  const body = req.body || {};

  if (body.title !== undefined) patch.title = String(body.title);
  if (body.description !== undefined) patch.description = String(body.description);
  if (body.publicMessage !== undefined) patch.publicMessage = String(body.publicMessage);
  if (body.isPublic !== undefined) patch.isPublic = Boolean(body.isPublic);

  if (body.severity !== undefined) {
    if (!isIncidentSeverity(body.severity)) {
      res.status(400).json({ success: false, message: 'Invalid severity' });
      return;
    }
    patch.severity = body.severity;
  }

  if (body.status !== undefined) {
    if (!isIncidentStatus(body.status)) {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }
    patch.status = body.status;
  }

  if (body.startedAt !== undefined) {
    const startedAt = new Date(String(body.startedAt));
    if (Number.isNaN(startedAt.getTime())) {
      res.status(400).json({ success: false, message: 'Invalid startedAt date' });
      return;
    }
    patch.startedAt = startedAt;
  }

  const updated = await updateIncident(req.params.id, patch);
  if (!updated) {
    res.status(404).json({ success: false, message: 'Incident not found' });
    return;
  }
  res.status(200).json({ success: true, data: updated });
};

export const postAdminResolveIncident = async (req: Request, res: Response): Promise<void> => {
  const resolved = await resolveIncident(req.params.id);
  if (!resolved) {
    res.status(404).json({ success: false, message: 'Incident not found' });
    return;
  }
  res.status(200).json({ success: true, data: resolved });
};
