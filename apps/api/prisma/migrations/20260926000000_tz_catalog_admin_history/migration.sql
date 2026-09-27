-- DropForeignKey
ALTER TABLE "TaxonomyNode" DROP CONSTRAINT "TaxonomyNode_parentId_fkey";

-- AlterTable
ALTER TABLE "CatalogSolution" ADD COLUMN     "acquisitionModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "airsideCertified" BOOLEAN,
ADD COLUMN     "autonomyHours" DOUBLE PRECISION,
ADD COLUMN     "availability" TEXT,
ADD COLUMN     "cases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "costs" JSONB,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "dimensions" TEXT,
ADD COLUMN     "elevatorIntegration" BOOLEAN,
ADD COLUMN     "environment" TEXT,
ADD COLUMN     "infrastructure" JSONB,
ADD COLUMN     "lifespanYears" DOUBLE PRECISION,
ADD COLUMN     "limitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "maxFloorDeviationMm" DOUBLE PRECISION,
ADD COLUMN     "maxTempC" DOUBLE PRECISION,
ADD COLUMN     "minAisleWidthM" DOUBLE PRECISION,
ADD COLUMN     "minCeilingHeightM" DOUBLE PRECISION,
ADD COLUMN     "minTempC" DOUBLE PRECISION,
ADD COLUMN     "navigation" TEXT,
ADD COLUMN     "noiseDb" DOUBLE PRECISION,
ADD COLUMN     "operatingConditions" TEXT,
ADD COLUMN     "payloadKg" DOUBLE PRECISION,
ADD COLUMN     "positioningAccuracyMm" DOUBLE PRECISION,
ADD COLUMN     "processes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "solutionType" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "throughput" DOUBLE PRECISION,
ADD COLUMN     "throughputUnit" TEXT,
ADD COLUMN     "unconfirmedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "weightKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ParameterField" ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "calculatedAt" TIMESTAMP(3),
ADD COLUMN     "modelVersion" TEXT,
ADD COLUMN     "solutionId" TEXT;

-- DropTable
DROP TABLE "TaxonomyNode";

-- CreateTable
CREATE TABLE "ProjectCalculation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataVersion" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "solutionId" TEXT,
    "parameters" JSONB NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "ProjectCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "actualAt" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userEmail" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "diff" JSONB,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCalculation_projectId_createdAt_idx" ON "ProjectCalculation"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ChangeLog_createdAt_idx" ON "ChangeLog"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ProjectCalculation" ADD CONSTRAINT "ProjectCalculation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

