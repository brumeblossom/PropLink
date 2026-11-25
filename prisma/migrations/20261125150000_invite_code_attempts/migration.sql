-- CreateTable
CREATE TABLE IF NOT EXISTS "invite_code_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ip_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_code_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invite_code_attempts_ip_hash_created_at_idx" ON "invite_code_attempts"("ip_hash", "created_at");

-- Enable RLS
ALTER TABLE "invite_code_attempts" ENABLE ROW LEVEL SECURITY;
