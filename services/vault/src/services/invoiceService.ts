/**
 * Invoice Service
 *
 * Creates and stores invoices after successful payment.
 * Tied to workspace_id. One payment → one invoice.
 * Invoice number format: NS-YYYY-XXXX
 */

import { ObjectId } from 'mongodb';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { IInvoice, InvoiceStatus } from '../models/Invoice';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  individual: 'Individual',
  family: 'Family',
  team: 'Team',
  business: 'Business',
  free: 'Free',
};

const INVOICE_PDF_DIR = process.env.INVOICE_PDF_DIR || path.join(process.cwd(), 'invoices');
const INVOICE_PDF_BASE_URL = process.env.INVOICE_PDF_BASE_URL || ''; // e.g. /v/billing/invoices (serve via route)

export interface CreateInvoiceParams {
  workspaceId: string | ObjectId;
  userId: string | ObjectId;
  subscriptionId: string | ObjectId | null;
  paymentOrderId: string | ObjectId;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  currency: 'INR' | 'USD' | 'EUR' | 'GBP';
  taxAmount: number;
  totalAmount: number;
  customerEmail?: string;
}

function getPlanDisplayName(planId: string): string {
  return PLAN_DISPLAY_NAMES[planId?.toLowerCase()] || planId || 'Subscription';
}

/**
 * Get next invoice number for format NS-YYYY-XXXX (e.g. NS-2026-0001)
 */
export async function getNextInvoiceNumber(): Promise<string> {
  const db = new Database('vault');
  const year = new Date().getFullYear();
  const prefix = `NS-${year}-`;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);

  const invoices = await db.findMany(collection.invoices, { invoiceNumber: pattern }, { sort: { invoiceNumber: -1 }, limit: 1 });
  let nextSeq = 1;
  if (invoices.length > 0) {
    const last = invoices[0] as IInvoice;
    const match = last.invoiceNumber.match(pattern);
    if (match) nextSeq = parseInt(match[1], 10) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Idempotency: check if invoice already exists for this payment
 */
export async function findInvoiceByRazorpayPaymentId(razorpayPaymentId: string): Promise<IInvoice | null> {
  const db = new Database('vault');
  const inv = await db.findOne(collection.invoices, { razorpayPaymentId }) as IInvoice | null;
  return inv;
}

export async function findInvoiceByOrderId(orderId: string): Promise<IInvoice | null> {
  const db = new Database('vault');
  const inv = await db.findOne(collection.invoices, { razorpayOrderId: orderId }) as IInvoice | null;
  return inv;
}

/**
 * Create invoice record and generate PDF
 */
export async function createInvoice(params: CreateInvoiceParams): Promise<IInvoice | null> {
  try {
    const db = new Database('vault');

    if (params.razorpayPaymentId) {
      const existing = await findInvoiceByRazorpayPaymentId(params.razorpayPaymentId);
      if (existing) {
        logger.info({ invoiceId: existing._id, razorpayPaymentId: params.razorpayPaymentId }, 'Invoice already exists (idempotency)');
        return existing;
      }
    }

    const invoiceNumber = await getNextInvoiceNumber();
    const now = new Date();
    const planName = getPlanDisplayName(params.planId);

    const invoice: Omit<IInvoice, '_id'> = {
      workspaceId: new ObjectId(params.workspaceId.toString()),
      userId: new ObjectId(params.userId.toString()),
      subscriptionId: params.subscriptionId ? new ObjectId(params.subscriptionId.toString()) : null,
      razorpayOrderId: params.razorpayOrderId,
      razorpayPaymentId: params.razorpayPaymentId,
      invoiceNumber,
      planName,
      planId: params.planId,
      billingCycle: params.billingCycle,
      amount: params.amount,
      currency: params.currency,
      taxAmount: params.taxAmount,
      totalAmount: params.totalAmount,
      status: 'paid',
      invoiceUrl: null,
      issuedAt: now,
      createdAt: now,
      updatedAt: now,
      customerEmail: params.customerEmail,
      paymentOrderId: new ObjectId(params.paymentOrderId.toString()),
    };

    const result = await db.insertOne(collection.invoices, invoice);
    const insertedId = result.insertedId;
    const insertedInvoice = await db.findOne(collection.invoices, { _id: insertedId }) as IInvoice;

    try {
      const pdfPath = await generateInvoicePdf(insertedInvoice);
      if (pdfPath) {
        await db.updateOne(
          collection.invoices,
          { _id: insertedId },
          { $set: { invoiceUrl: pdfPath, updatedAt: new Date() } }
        );
        (insertedInvoice as IInvoice).invoiceUrl = pdfPath;
      }
    } catch (pdfError: any) {
      logger.warn({ err: pdfError?.message, invoiceId: insertedId }, 'Invoice PDF generation failed; invoice record saved');
    }

    logger.info({ invoiceId: insertedId, invoiceNumber, workspaceId: params.workspaceId }, 'Invoice created');
    return (await db.findOne(collection.invoices, { _id: insertedId })) as IInvoice;
  } catch (error: any) {
    logger.error(error, 'Error creating invoice');
    throw error;
  }
}

/**
 * Generate professional invoice PDF (A4, SaaS-style)
 */
async function generateInvoicePdf(invoice: IInvoice): Promise<string | null> {
  if (!fs.existsSync(INVOICE_PDF_DIR)) {
    fs.mkdirSync(INVOICE_PDF_DIR, { recursive: true });
  }

  const filename = `invoice-${invoice.invoiceNumber.replace(/\s/g, '-')}-${invoice._id}.pdf`;
  const filePath = path.join(INVOICE_PDF_DIR, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const primary = '#2563eb';
    const gray = '#6b7280';
    const dark = '#111827';

    doc.fontSize(24).fillColor(primary).text('NovaSafe', 50, 50);
    doc.fontSize(10).fillColor(gray).text('Cybersecurity & Password Management', 50, 78);
    doc.fontSize(9).fillColor(gray)
      .text('Support: support@novasafe.io', 50, 96)
      .text('https://novasafe.io', 50, 108);

    doc.moveDown(2);
    doc.fontSize(11).fillColor(dark).text('INVOICE', 50, 140);
    doc.fontSize(10).fillColor(gray)
      .text(`Invoice # ${invoice.invoiceNumber}`, 50, 165)
      .text(`Date: ${new Date(invoice.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, 50, 180);

    doc.text(`Customer: ${invoice.customerEmail || '—'}`, 50, 210);
    doc.moveDown(1);

    const tableTop = 240;
    doc.fontSize(10).fillColor(dark);
    doc.text('Description', 50, tableTop);
    doc.text('Billing Cycle', 250, tableTop);
    doc.text('Amount', 400, tableTop);
    doc.text('Tax', 470, tableTop);
    doc.text('Total', 520, tableTop);

    doc.moveTo(50, tableTop + 18).lineTo(570, tableTop + 18).strokeColor(gray).stroke();
    const rowY = tableTop + 32;
    doc.fillColor(dark).text(invoice.planName, 50, rowY);
    doc.text(invoice.billingCycle === 'yearly' ? 'Yearly' : 'Monthly', 250, rowY);
    doc.text(formatMoney(invoice.amount, invoice.currency), 400, rowY);
    doc.text(formatMoney(invoice.taxAmount, invoice.currency), 470, rowY);
    doc.text(formatMoney(invoice.totalAmount, invoice.currency), 520, rowY);

    doc.moveDown(3);
    doc.fontSize(9).fillColor(gray).text(`Payment ID: ${invoice.razorpayPaymentId || invoice.razorpayOrderId || '—'}`, 50, 320);

    if (invoice.currency === 'INR') {
      doc.text('GST applied as per applicable rates.', 50, 338);
    } else {
      doc.text('Taxes may apply based on your region.', 50, 338);
    }

    doc.moveDown(4);
    doc.fontSize(8).fillColor(gray)
      .text('Secure payment powered by Razorpay', 50, 750);

    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

function formatMoney(value: number, currency: string): string {
  if (currency === 'INR') return `₹${value.toFixed(2)}`;
  if (currency === 'USD') return `$${value.toFixed(2)}`;
  return `${currency} ${value.toFixed(2)}`;
}

export async function listInvoicesByWorkspace(
  workspaceId: string | ObjectId,
  filters?: { status?: InvoiceStatus; planId?: string; fromDate?: Date; toDate?: Date }
): Promise<IInvoice[]> {
  const db = new Database('vault');
  const query: Record<string, unknown> = { workspaceId: new ObjectId(workspaceId.toString()) };
  if (filters?.status) query.status = filters.status;
  if (filters?.planId) query.planId = filters.planId;
  if (filters?.fromDate) query.issuedAt = { $gte: filters.fromDate };
  if (filters?.toDate) query.issuedAt = { ...(query.issuedAt as object), $lte: filters.toDate };

  const list = await db.findMany(collection.invoices, query, { sort: { issuedAt: -1 }, limit: 100 }) as IInvoice[];
  return list;
}

export async function getInvoiceById(invoiceId: string | ObjectId): Promise<IInvoice | null> {
  const db = new Database('vault');
  const id = typeof invoiceId === 'string' && /^[a-fA-F0-9]{24}$/.test(invoiceId) ? new ObjectId(invoiceId) : invoiceId;
  const inv = await db.findOne(collection.invoices, { _id: id }) as IInvoice | null;
  return inv;
}

export async function getInvoiceFilePath(invoice: IInvoice): Promise<string | null> {
  if (!invoice.invoiceUrl) return null;
  if (path.isAbsolute(invoice.invoiceUrl) && fs.existsSync(invoice.invoiceUrl)) return invoice.invoiceUrl;
  const joined = path.join(INVOICE_PDF_DIR, path.basename(invoice.invoiceUrl));
  return fs.existsSync(joined) ? joined : null;
}

export async function markInvoiceRefunded(invoiceId: string | ObjectId): Promise<void> {
  const db = new Database('vault');
  const id = typeof invoiceId === 'string' ? new ObjectId(invoiceId) : invoiceId;
  await db.updateOne(collection.invoices, { _id: id }, { $set: { status: 'refunded', updatedAt: new Date() } });
}
