-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('pending', 'active', 'declined', 'cancelled', 'expired');

-- AlterTable
ALTER TABLE "lease_documents" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "size_bytes" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leases" ADD COLUMN     "invitation_expires_at" TIMESTAMPTZ,
ADD COLUMN     "invited_at" TIMESTAMPTZ,
ADD COLUMN     "responded_at" TIMESTAMPTZ,
ADD COLUMN     "status" "LeaseStatus" NOT NULL DEFAULT 'active';
