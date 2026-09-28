-- Расчёты мастера: результат POST /calculations, открывается по id.
CREATE TABLE "Calculation" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "objectType" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,
    "processes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parameters" JSONB NOT NULL,
    "dataVersion" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "Calculation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Calculation_createdAt_idx" ON "Calculation"("createdAt");
