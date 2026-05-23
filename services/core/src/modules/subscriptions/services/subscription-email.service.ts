import { SUBSCRIPTION_CONFIG } from "../config/subscription.config";
import { sendMail } from '../../auth/services/email.service';

type SubscriptionEmailTemplate =
  | "purchase_successful"
  | "subscription_renewed"
  | "payment_failed"
  | "subscription_cancelled"
  | "subscription_expired"
  | "trial_ending"
  | "restore_successful";

const templateLabels: Record<SubscriptionEmailTemplate, string> = {
  purchase_successful: "Purchase successful",
  subscription_renewed: "Subscription renewed",
  payment_failed: "Payment failed",
  subscription_cancelled: "Subscription cancelled",
  subscription_expired: "Subscription expired",
  trial_ending: "Trial ending soon",
  restore_successful: "Purchases restored",
};

export async function sendSubscriptionLifecycleEmail(
  toEmail: string,
  template: SubscriptionEmailTemplate,
  data: {
    planName?: string;
    renewalDate?: string | null;
    amountLabel?: string;
  },
): Promise<boolean> {
  const title = templateLabels[template];
  const planName = data.planName || "NovaSafe Pro";
  const renewal = data.renewalDate
    ? new Date(data.renewalDate).toLocaleDateString()
    : "N/A";
  const amount = data.amountLabel || "";
  const subject = `NovaSafe Subscription: ${title}`;
  const html = `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f6f8fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e8edf5;">
        <h1 style="margin:0 0 8px;color:#0f172a;font-size:22px;">${title}</h1>
        <p style="margin:0 0 12px;color:#475569;">Your ${planName} subscription status has been updated.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
          <p style="margin:0;color:#0f172a;"><b>Plan:</b> ${planName}</p>
          <p style="margin:8px 0 0;color:#334155;"><b>Renewal:</b> ${renewal}</p>
          ${amount ? `<p style="margin:8px 0 0;color:#334155;"><b>Amount:</b> ${amount}</p>` : ""}
        </div>
        <p style="margin-top:16px;color:#64748b;font-size:12px;">
          If you did not make this change, contact NovaSafe support immediately.
        </p>
      </div>
    </div>
  `;
  const text = `${title}\nPlan: ${planName}\nRenewal: ${renewal}\n${amount ? `Amount: ${amount}\n` : ""}If this wasn't you, contact support.`;
  return sendMail(toEmail, subject, html, text, {
    from: SUBSCRIPTION_CONFIG.emailFrom,
  });
}
