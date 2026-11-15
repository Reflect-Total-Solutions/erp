/**
 * Email dispatch service supporting both SMTP (Nodemailer) and Resend REST API.
 * Always sends directly to the user's specific registered email address.
 */
import nodemailer from "nodemailer";
import { generateSecurePassword } from "./password-generator";

export { generateSecurePassword };

export interface SendUserWelcomeEmailParams {
  toEmail: string;
  userName: string;
  jobRole: string;
  mobileNumber?: string;
  temporaryPassword: string;
  loginUrl?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
  warning?: string;
}

/**
 * Sends welcome and onboarding credentials email to newly created ERP user.
 */
export async function sendUserWelcomeEmail({
  toEmail,
  userName,
  jobRole,
  temporaryPassword,
  loginUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100",
}: SendUserWelcomeEmailParams): Promise<SendEmailResult> {
  const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Reflect ERP Account Credentials</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #1e3a8a; padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">
                REFLECT TOTAL SOLUTIONS
              </h1>
              <p style="margin: 4px 0 0 0; color: #93c5fd; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">
                Enterprise Resource Planning Portal
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 18px; font-weight: 600;">
                Welcome, ${userName}!
              </h2>
              <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                An administrative account has been provisioned for you on the <strong>Reflect ERP</strong> platform with the assigned role of <span style="display: inline-block; background-color: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 12px; text-transform: uppercase;">${jobRole}</span>.
              </p>

              <!-- Credentials Card -->
              <table role="presentation" width="100%" style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; margin: 24px 0; padding: 18px;">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 8px;">
                      Your Login Credentials
                    </div>
                    <div style="margin-bottom: 12px;">
                      <span style="font-size: 12px; color: #475569; display: block; margin-bottom: 2px;">Email Address:</span>
                      <strong style="font-size: 14px; color: #0f172a; font-family: monospace;">${toEmail}</strong>
                    </div>
                    <div>
                      <span style="font-size: 12px; color: #475569; display: block; margin-bottom: 2px;">Temporary Password:</span>
                      <div style="background-color: #ffffff; border: 1px dashed #2563eb; padding: 10px 14px; border-radius: 8px; display: inline-block;">
                        <span style="font-family: 'Courier New', Courier, monospace; font-size: 16px; font-weight: 700; color: #1d4ed8; letter-spacing: 0.1em;">${temporaryPassword}</span>
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Call to Action -->
              <table role="presentation" width="100%" style="margin: 28px 0 20px 0;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: 0.02em; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
                      Access ERP Portal &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 24px;">
                <p style="margin: 0 0 6px 0; color: #0f172a; font-size: 12px; font-weight: 600;">
                  Important Security Requirement:
                </p>
                <ul style="margin: 0; padding-left: 20px; color: #64748b; font-size: 12px; line-height: 1.6;">
                  <li><strong>First-Time Login Requirement:</strong> When you sign in with this temporary password, you will be prompted to create your own permanent password.</li>
                  <li>Never share your credentials with anyone.</li>
                  <li>Always verify you are accessing the official portal at <code>${loginUrl}</code>.</li>
                </ul>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                &copy; ${new Date().getFullYear()} Reflect Total Solutions (Pvt) Ltd. All rights reserved.
              </p>
              <p style="margin: 4px 0 0 0; font-size: 10px; color: #94a3b8;">
                This automated message was sent securely by the Enterprise Access Control System.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  // 1. If SMTP is configured, send directly to the specific user via Nodemailer
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const port = Number(process.env.SMTP_PORT) || 587;
      const secure = port === 465;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || `Reflect ERP <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: `Welcome to Reflect ERP - Credentials for ${userName}`,
        html: emailHtml,
      });

      return {
        success: true,
        id: info.messageId,
      };
    } catch (smtpErr) {
      console.error("SMTP email dispatch error:", smtpErr);
      return {
        success: false,
        error: smtpErr instanceof Error ? smtpErr.message : "SMTP delivery failed.",
      };
    }
  }

  // 2. Dispatch via Resend API strictly to the user's specific email address
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: "No email service configured (neither SMTP nor RESEND_API_KEY).",
    };
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || "Reflect ERP <onboarding@resend.dev>";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: `Welcome to Reflect ERP - Credentials for ${userName}`,
        html: emailHtml,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.warn("Resend API response:", data);

      if (response.status === 403 && typeof data.message === "string" && data.message.includes("testing emails")) {
        return {
          success: false,
          error: data.message,
          warning: `To send to external recipient "${toEmail}" via Resend, your domain must be verified at resend.com/domains. (Alternatively, SMTP can be configured in .env).`,
        };
      }

      return {
        success: false,
        error: data.message || "Failed to deliver email via Resend.",
      };
    }

    return {
      success: true,
      id: data.id,
    };
  } catch (err) {
    console.error("Failed to call Resend API:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error during email dispatch.",
    };
  }
}

export interface SendSupplierPaymentReminderEmailParams {
  toEmail: string;
  recipientName: string;
  reminderType: "UPCOMING_DUE_REMINDER" | "DUE_TODAY" | "OVERDUE";
  invoiceNumber: string;
  supplierName: string;
  jobCode?: string;
  dueDate: string;
  outstandingBalanceFormatted: string;
  countdownLabel: string;
  invoiceLinkUrl: string;
}

/**
 * Dispatches a Supplier Invoice Payment Reminder / Overdue alert email.
 * Only called when `SupplierPaymentSettings.emailRemindersEnabled === true`.
 */
export async function sendSupplierPaymentReminderEmail(
  params: SendSupplierPaymentReminderEmailParams
): Promise<SendEmailResult> {
  const {
    toEmail,
    recipientName,
    reminderType,
    invoiceNumber,
    supplierName,
    jobCode,
    dueDate,
    outstandingBalanceFormatted,
    countdownLabel,
    invoiceLinkUrl,
  } = params;

  const badgeColor =
    reminderType === "OVERDUE"
      ? "#dc2626"
      : reminderType === "DUE_TODAY"
      ? "#d97706"
      : "#2563eb";
  const badgeText =
    reminderType === "OVERDUE"
      ? "OVERDUE PAYMENT ALERT"
      : reminderType === "DUE_TODAY"
      ? "PAYMENT DUE TODAY"
      : "UPCOMING PAYMENT REMINDER";

  const subject = `[Reflect ERP] ${badgeText}: ${invoiceNumber} (${supplierName}) — ${countdownLabel}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;">
          <tr>
            <td style="background-color:#0f172a;padding:22px 28px;">
              <div style="display:inline-block;background-color:${badgeColor};color:#ffffff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;letter-spacing:0.06em;">
                ${badgeText}
              </div>
              <h1 style="margin:10px 0 0 0;color:#ffffff;font-size:18px;font-weight:700;">
                Supplier Invoice Payment Notice
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px;">
              <p style="margin:0 0 14px 0;font-size:14px;color:#334155;">Hello ${recipientName || "Finance Team"},</p>
              <p style="margin:0 0 18px 0;font-size:14px;color:#475569;line-height:1.6;">
                This is an automated reminder regarding Supplier Invoice <strong>${invoiceNumber}</strong> for supplier <strong>${supplierName}</strong>${jobCode ? ` (Job <strong>${jobCode}</strong>)` : ""}.
              </p>
              <table role="presentation" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:20px;">
                <tr>
                  <td style="padding:4px 0;font-size:12px;color:#64748b;">Payment Due Date</td>
                  <td style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${dueDate}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-size:12px;color:#64748b;">Status / Countdown</td>
                  <td style="padding:4px 0;font-size:13px;font-weight:700;color:${badgeColor};text-align:right;">${countdownLabel}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-size:12px;color:#64748b;">Outstanding Balance</td>
                  <td style="padding:4px 0;font-size:15px;font-weight:800;color:#0f172a;text-align:right;">${outstandingBalanceFormatted}</td>
                </tr>
              </table>
              <div style="text-align:center;margin:22px 0 8px 0;">
                <a href="${invoiceLinkUrl}" target="_blank" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">
                  Open Supplier Invoice &rarr;
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
              Reflect ERP &mdash; Automated Supplier Payment Notification
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const port = Number(process.env.SMTP_PORT) || 587;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || `Reflect ERP <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject,
        html,
      });

      return { success: true, id: info.messageId };
    } catch (smtpErr) {
      return {
        success: false,
        error: smtpErr instanceof Error ? smtpErr.message : "SMTP reminder delivery failed.",
      };
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "No email provider configured (SMTP / RESEND_API_KEY).",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Reflect ERP <onboarding@resend.dev>",
        to: [toEmail],
        subject,
        html,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.message || "Resend delivery failed." };
    }
    return { success: true, id: data.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error sending reminder email.",
    };
  }
}
