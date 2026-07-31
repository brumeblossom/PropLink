import { prisma } from "@/lib/prisma";
import { NotificationChannel, NotificationStatus, RelatedType } from "@prisma/client";

/**
 * Dispatches an email or WhatsApp notification, handles status logging, and returns the log.
 * - Email: Sent via Resend API using standard fetch.
 * - WhatsApp: Stubbed as 'pending' with a TODO comment because template approval/credentials are pending.
 */
export async function dispatchNotification(params: {
  recipientId: string;
  channel: NotificationChannel;
  relatedType: RelatedType;
  relatedId: string;
  title: string;
  body: string;
  customId?: string; // e.g. reminder-7-2026-08-01 to help enforce custom idempotency checks
}) {
  const recipient = await prisma.user.findUnique({
    where: { id: params.recipientId },
    select: { email: true, phone: true },
  });

  if (!recipient) {
    throw new Error(`Recipient with ID ${params.recipientId} not found.`);
  }

  let status: NotificationStatus = "failed";
  let providerMessageId: string | null = params.customId || null;

  if (params.channel === NotificationChannel.email) {
    if (!recipient.email) {
      console.warn(`[dispatchNotification] Recipient ${params.recipientId} has no email address. Skipping email.`);
      providerMessageId = params.customId ? `${params.customId}|no_email` : "no_email";
    } else {
      try {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
          throw new Error("RESEND_API_KEY is not configured.");
        }

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: "PropLink <onboarding@resend.dev>",
            to: recipient.email,
            subject: params.title,
            html: `<div style="font-family: sans-serif; line-height: 1.5; color: #111;">
              <p>${params.body.replace(/\n/g, "<br/>")}</p>
            </div>`,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as { id: string };
          status = "sent";
          providerMessageId = params.customId ? `${params.customId}|${data.id}` : data.id;
          console.log(`[dispatchNotification] Email sent via Resend. Message ID: ${data.id}`);
        } else {
          const errText = await res.text();
          console.error(`[dispatchNotification] Resend API error:`, errText);
          providerMessageId = params.customId ? `${params.customId}|failed_${res.status}` : `failed_${res.status}`;
        }
      } catch (err) {
        console.error(`[dispatchNotification] Failed to send email via Resend:`, err);
        providerMessageId = params.customId ? `${params.customId}|error` : "error";
      }
    }
  } else if (params.channel === NotificationChannel.whatsapp) {
    // WhatsApp template approval / API credentials pending.
    // As per user instructions, we stub the send and log status to notification_log as 'pending'.
    // TODO: Integrate actual WhatsApp Cloud API or Termii dispatching when credentials/templates are ready.
    status = "pending";
    providerMessageId = params.customId ? `${params.customId}|pending_whatsapp_setup` : "pending_whatsapp_setup";
    console.log(`[dispatchNotification] WhatsApp template approval/credentials pending. Logged as pending for recipient: ${recipient.phone || params.recipientId}`);
  }

  // Write results to notification_log
  const log = await prisma.notificationLog.create({
    data: {
      recipientId: params.recipientId,
      channel: params.channel,
      relatedType: params.relatedType,
      relatedId: params.relatedId,
      status,
      providerMessageId,
      sentAt: new Date(),
    },
  });

  return log;
}
