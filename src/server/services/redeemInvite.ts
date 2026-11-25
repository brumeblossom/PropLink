import { prisma } from "@/lib/prisma";
import { createNotification } from "../utils/notifications";

export interface RedeemInviteParams {
  code: string;
  userId: string;
  email: string;
  fullName: string;
}

export type RedeemInviteResult =
  | { success: true; leaseId: string; unitId: string; landlordId: string }
  | {
      success: false;
      error: string;
      reason: "not_found" | "used" | "expired" | "email_mismatch" | "db_error";
    };

export async function redeemInvite({
  code,
  userId,
  email,
  fullName,
}: RedeemInviteParams): Promise<RedeemInviteResult> {
  const trimmedCode = code.trim();
  const invite = await prisma.inviteCode.findFirst({
    where: { code: trimmedCode },
    include: {
      lease: {
        include: {
          tenant: true,
          unit: {
            include: {
              property: true,
            },
          },
        },
      },
    },
  });

  if (!invite) {
    return {
      success: false,
      error: "This invite code was not found. Ask your landlord for a new one.",
      reason: "not_found",
    };
  }

  if (invite.redeemedAt) {
    return {
      success: false,
      error: "This invite code has already been redeemed.",
      reason: "used",
    };
  }

  if (new Date() > invite.expiresAt) {
    return {
      success: false,
      error: "This invite code has expired. Ask your landlord for a new one.",
      reason: "expired",
    };
  }

  // Check if email matches the placeholder tenant's email
  if (invite.lease.tenant.email.toLowerCase() !== email.toLowerCase()) {
    return {
      success: false,
      error: "The email address does not match the one registered with this invite code.",
      reason: "email_mismatch",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Check if user with userId already exists in prisma.user
      const existingUser = await tx.user.findUnique({ where: { id: userId } });

      if (existingUser) {
        // If existingUser has a different id from placeholder tenant, relink lease and clean up placeholder
        if (existingUser.id !== invite.lease.tenantId) {
          const placeholderId = invite.lease.tenantId;
          await tx.lease.update({
            where: { id: invite.leaseId },
            data: { tenantId: existingUser.id },
          });

          // Check if placeholder user has any remaining leases
          const otherLeases = await tx.lease.count({
            where: { tenantId: placeholderId },
          });
          if (otherLeases === 0) {
            await tx.user.delete({ where: { id: placeholderId } }).catch(() => {});
          }
        }
        await tx.user.update({
          where: { id: existingUser.id },
          data: { fullName },
        });
      } else {
        // Update placeholder tenant's id to the new Supabase auth user id
        // CASCADE ON UPDATE on all related tables ensures all tenantId references are updated!
        await tx.user.update({
          where: { id: invite.lease.tenantId },
          data: {
            id: userId,
            fullName,
          },
        });
      }

      // Mark invite code as redeemed
      await tx.inviteCode.update({
        where: { id: invite.id },
        data: {
          redeemedAt: new Date(),
        },
      });
    });

    try {
      // Notify the landlord
      await createNotification({
        recipientId: invite.lease.unit.property.landlordId,
        type: "invite_redeemed",
        title: "Tenant Invite Redeemed",
        body: `${fullName} has redeemed their invite code for unit ${invite.lease.unit.unitNumber}.`,
        relatedType: "unit",
        relatedId: invite.lease.unitId,
      });

      // Notify the tenant
      await createNotification({
        recipientId: userId,
        type: "lease_created",
        title: "Lease Agreement Linked",
        body: `Your lease agreement for unit ${invite.lease.unit.unitNumber} has been successfully linked to your account.`,
        relatedType: "lease",
        relatedId: invite.leaseId,
      });
    } catch (err) {
      console.error("Failed to create notifications on invite redemption:", err);
    }

    return {
      success: true,
      leaseId: invite.leaseId,
      unitId: invite.lease.unitId,
      landlordId: invite.lease.unit.property.landlordId,
    };
  } catch (err) {
    console.error("Database error during invite redemption:", err);
    return {
      success: false,
      error: "An unexpected error occurred while linking your account. Please try again.",
      reason: "db_error",
    };
  }
}
