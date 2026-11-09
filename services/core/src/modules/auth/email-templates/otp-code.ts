import { emailBrandHeaderHtml } from "./branding";
import { escapeHtml } from "./escape";

export type OtpEmailVariant = "signup" | "password-reset";

export type OtpEmailContent = {
  heading: string;
  lead: string;
  securityNote: string;
};

const COPY: Record<OtpEmailVariant, OtpEmailContent> = {
  signup: {
    heading: "Your NovaSafe signup code",
    lead: "Use this one-time code to verify your email and finish creating your account.",
    securityNote:
      "If you didn't request this code, you can ignore this email — no account will be created without it.",
  },
  "password-reset": {
    heading: "Your password reset code",
    lead: "Use this one-time code to verify your identity and choose a new password.",
    securityNote: "If you didn't request a password reset, you can safely ignore this email.",
  },
};

const NOVASAFE = {
  primary: "#4f6cf7",
  primaryDark: "#3d57e8",
  text: "#0f172a",
  muted: "#475569",
  faint: "#64748b",
  pageBg: "#eef2f8",
  cardBg: "#ffffff",
  codeBg: "#f1f5f9",
  footerBg: "#f8fafc",
  border: "#e2e8f0",
};

export type RenderOtpEmailParams = {
  variant: OtpEmailVariant;
  code: string;
  /** Shown in body copy, e.g. 10 */
  ttlMinutes: number;
};

export const renderOtpCodeEmail = ({
  variant,
  code,
  ttlMinutes,
}: RenderOtpEmailParams): { html: string; text: string } => {
  const copy = COPY[variant];
  const safeCode = escapeHtml(code);
  const year = new Date().getFullYear();
  const brand = emailBrandHeaderHtml();

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:${NOVASAFE.pageBg};">
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:${NOVASAFE.pageBg};padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;width:100%;border-collapse:collapse;">
        <tr>
          <td style="background:${NOVASAFE.cardBg};border:1px solid ${NOVASAFE.border};border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,0.06);">
            ${brand}
            <div style="background:linear-gradient(180deg, ${NOVASAFE.primary} 0%, ${NOVASAFE.primaryDark} 100%);padding:20px 28px;text-align:center;margin-top:12px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">${escapeHtml(copy.heading)}</h1>
            </div>
            <div style="padding:28px;">
              <p style="margin:0 0 8px;color:${NOVASAFE.text};font-size:15px;">Hello,</p>
              <p style="margin:0 0 22px;color:${NOVASAFE.muted};font-size:15px;line-height:1.55;">${escapeHtml(copy.lead)}</p>
              <div style="background:${NOVASAFE.codeBg};border:1px solid ${NOVASAFE.border};border-radius:12px;padding:22px 16px;text-align:center;margin:0 0 20px;">
                <span style="font-size:32px;letter-spacing:0.35em;font-weight:800;color:${NOVASAFE.primary};font-variant-numeric:tabular-nums;">${safeCode}</span>
              </div>
              <p style="margin:0 0 14px;color:${NOVASAFE.faint};font-size:14px;line-height:1.5;">
                This code is valid for <strong style="color:${NOVASAFE.text};">${ttlMinutes} minutes</strong>.
                Please do not share it with anyone.
              </p>
              <p style="margin:0;color:${NOVASAFE.faint};font-size:13px;line-height:1.5;">${escapeHtml(copy.securityNote)}</p>
              <p style="margin:18px 0 0;color:${NOVASAFE.muted};font-size:14px;">Thank you for choosing NovaSafe.</p>
            </div>
            <div style="background:${NOVASAFE.footerBg};border-top:1px solid ${NOVASAFE.border};padding:16px 28px;text-align:center;">
              <p style="margin:0;color:${NOVASAFE.faint};font-size:12px;">© ${year} NovaSafe. All rights reserved.</p>
            </div>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;

  const text = [
    copy.heading,
    "",
    copy.lead,
    "",
    `Your code: ${code}`,
    "",
    `This code is valid for ${ttlMinutes} minutes. Please do not share it with anyone.`,
    "",
    copy.securityNote,
    "",
    "— NovaSafe",
  ].join("\n");

  return { html, text };
};
