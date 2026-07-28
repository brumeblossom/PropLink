import { prisma } from "@/lib/prisma";

export async function createNotification(params: {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  relatedType?: string;
  relatedId?: string;
}) {
  try {
    return await prisma.notification.create({
      data: {
        recipientId: params.recipientId,
        type: params.type,
        title: params.title,
        body: params.body,
        relatedType: params.relatedType || null,
        relatedId: params.relatedId || null,
      },
    });
  } catch (error) {
    console.error("Error creating system notification:", error);
    throw error;
  }
}
