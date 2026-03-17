/**
 * Invoice Controller
 *
 * List and download invoices. Access scoped to workspace.
 */

import { Request, Response } from 'express';
import {
  listInvoicesByWorkspace,
  getInvoiceById,
  getInvoiceFilePath,
} from '../services/invoiceService';
import logger from '../logger';
import fs from 'fs';

const isObjectId = (s: string) => /^[a-fA-F0-9]{24}$/.test(s);

/**
 * GET /v/billing/invoices
 * List invoices for the current workspace (from X-Workspace-Id / rbacContext)
 */
export const listInvoicesController = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.rbacContext?.organizationId;
    if (!orgId || !isObjectId(orgId)) {
      res.status(400).json({
        success: false,
        message: 'Workspace context required',
        error: 'X-Workspace-Id or organization context missing',
      });
      return;
    }

    const status = req.query.status as string | undefined;
    const planId = req.query.planId as string | undefined;
    const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
    const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;

    const filters: { status?: any; planId?: string; fromDate?: Date; toDate?: Date } = {};
    if (status && ['paid', 'failed', 'refunded', 'pending'].includes(status)) filters.status = status;
    if (planId) filters.planId = planId;
    if (fromDate && !isNaN(fromDate.getTime())) filters.fromDate = fromDate;
    if (toDate && !isNaN(toDate.getTime())) filters.toDate = toDate;

    const invoices = await listInvoicesByWorkspace(orgId, Object.keys(filters).length ? filters : undefined);

    const data = invoices.map((inv) => ({
      id: inv._id?.toString(),
      invoiceNumber: inv.invoiceNumber,
      planName: inv.planName,
      planId: inv.planId,
      billingCycle: inv.billingCycle,
      amount: inv.amount,
      currency: inv.currency,
      taxAmount: inv.taxAmount,
      totalAmount: inv.totalAmount,
      status: inv.status,
      issuedAt: inv.issuedAt,
      createdAt: inv.createdAt,
      downloadUrl: inv.invoiceUrl ? `/billing/invoices/${inv._id}/file` : null,
    }));

    res.status(200).json({
      success: true,
      message: 'Invoices retrieved',
      data,
    });
  } catch (error: any) {
    logger.error(error, 'Error listing invoices');
    res.status(500).json({
      success: false,
      message: 'Failed to list invoices',
      error: error.message,
    });
  }
};

/**
 * GET /v/billing/invoices/:id
 * Get single invoice (must belong to user's workspace)
 */
export const getInvoiceController = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.rbacContext?.organizationId;
    if (!orgId || !isObjectId(orgId)) {
      res.status(400).json({
        success: false,
        message: 'Workspace context required',
      });
      return;
    }

    const id = req.params.id;
    if (!id || !isObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid invoice ID' });
      return;
    }

    const invoice = await getInvoiceById(id);
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    if (invoice.workspaceId?.toString() !== orgId) {
      res.status(403).json({ success: false, message: 'Access denied to this invoice' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Invoice retrieved',
      data: {
        id: invoice._id?.toString(),
        invoiceNumber: invoice.invoiceNumber,
        planName: invoice.planName,
        planId: invoice.planId,
        billingCycle: invoice.billingCycle,
        amount: invoice.amount,
        currency: invoice.currency,
        taxAmount: invoice.taxAmount,
        totalAmount: invoice.totalAmount,
        status: invoice.status,
        issuedAt: invoice.issuedAt,
        createdAt: invoice.createdAt,
        downloadUrl: invoice.invoiceUrl ? `/billing/invoices/${invoice._id}/file` : null,
      },
    });
  } catch (error: any) {
    logger.error(error, 'Error getting invoice');
    res.status(500).json({
      success: false,
      message: 'Failed to get invoice',
      error: error.message,
    });
  }
};

/**
 * GET /v/billing/invoices/:id/file
 * Stream invoice PDF (must belong to user's workspace)
 */
export const downloadInvoiceController = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.rbacContext?.organizationId;
    if (!orgId || !isObjectId(orgId)) {
      res.status(400).json({
        success: false,
        message: 'Workspace context required',
      });
      return;
    }

    const id = req.params.id;
    if (!id || !isObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid invoice ID' });
      return;
    }

    const invoice = await getInvoiceById(id);
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    if (invoice.workspaceId?.toString() !== orgId) {
      res.status(403).json({ success: false, message: 'Access denied to this invoice' });
      return;
    }

    const filePath = await getInvoiceFilePath(invoice);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'Invoice PDF not available' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error: any) {
    logger.error(error, 'Error downloading invoice');
    res.status(500).json({
      success: false,
      message: 'Failed to download invoice',
      error: error.message,
    });
  }
};
