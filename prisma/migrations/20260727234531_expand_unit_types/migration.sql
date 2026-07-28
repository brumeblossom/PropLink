-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "expected_units" INTEGER;

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "rooms_count" INTEGER;

-- AlterTable to convert unit_type column to TEXT safely
ALTER TABLE "units" ALTER COLUMN "unit_type" TYPE TEXT USING "unit_type"::text;

-- Migrate old data: 'flat' -> 'apartment/flat'
UPDATE "units" SET "unit_type" = 'apartment/flat' WHERE "unit_type" = 'flat';

-- DropEnum
DROP TYPE IF EXISTS "UnitType";
