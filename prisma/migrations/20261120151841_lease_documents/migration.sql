-- CreateTable
CREATE TABLE "lease_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lease_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "mime_type" TEXT NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lease_documents_lease_id_idx" ON "lease_documents"("lease_id");

-- AddForeignKey
ALTER TABLE "lease_documents" ADD CONSTRAINT "lease_documents_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_documents" ADD CONSTRAINT "lease_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy every existing leases.document_url into lease_documents
INSERT INTO "lease_documents" ("id", "lease_id", "name", "path", "size_bytes", "mime_type", "uploaded_by_id", "created_at")
SELECT
    gen_random_uuid(),
    l.id,
    COALESCE(NULLIF(regexp_replace(l.document_url, '^.*/', ''), ''), 'Lease_Agreement.pdf'),
    l.document_url,
    0,
    CASE 
      WHEN lower(l.document_url) LIKE '%.pdf' THEN 'application/pdf'
      WHEN lower(l.document_url) LIKE '%.jpg' OR lower(l.document_url) LIKE '%.jpeg' THEN 'image/jpeg'
      WHEN lower(l.document_url) LIKE '%.png' THEN 'image/png'
      ELSE 'application/octet-stream'
    END,
    p.landlord_id,
    CURRENT_TIMESTAMP
FROM "leases" l
JOIN "units" u ON u.id = l.unit_id
JOIN "properties" p ON p.id = u.property_id
WHERE l.document_url IS NOT NULL AND l.document_url <> '';

-- Enable Row-Level Security on lease_documents
ALTER TABLE "lease_documents" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landlord_lease_documents_policy ON "lease_documents";
CREATE POLICY landlord_lease_documents_policy ON "lease_documents"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = lease_documents.lease_id
        AND p.landlord_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = lease_documents.lease_id
        AND p.landlord_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tenant_read_lease_documents_policy ON "lease_documents";
CREATE POLICY tenant_read_lease_documents_policy ON "lease_documents"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = lease_documents.lease_id
        AND l.tenant_id = auth.uid()
    )
  );
