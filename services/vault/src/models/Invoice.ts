/**
 * Invoice Model Interface
 *
 * Invoices are tied to workspace_id. One payment → one invoice.
 */

import { ObjectId } from 'mongodb';

export type InvoiceStatus = 'paid' | 'failed' | 'refunded' | 'pending';

export type InvoiceCurrency = 'INR' | 'USD' | 'EUR' | 'GBP';

export interface IInvoice {
  _id?: ObjectId;

  workspaceId: ObjectId | string;
  userId: ObjectId | string;
  subscriptionId?: ObjectId | string | null;

  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;

  invoiceNumber: string;
  planName: string;
  planId: string;
  billingCycle: 'monthly' | 'yearly';

  amount: number;
  currency: InvoiceCurrency;
  taxAmount: number;
  totalAmount: number;

  status: InvoiceStatus;
  invoiceUrl: string | null; // PDF path or URL

  issuedAt: Date;
  createdAt: Date;
  updatedAt?: Date;

  /** Customer email at time of invoice (for PDF) */
  customerEmail?: string;
  /** Optional: for idempotency / duplicate check */
  paymentOrderId?: ObjectId | string | null;
}
