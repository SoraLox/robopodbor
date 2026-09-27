-- DropIndex
DROP INDEX "Project_userId_idx";

-- CreateIndex
CREATE INDEX "CatalogSolution_objectTypes_idx" ON "CatalogSolution" USING GIN ("objectTypes");

-- CreateIndex
CREATE INDEX "Project_userId_createdAt_idx" ON "Project"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Scenario_projectId_sortOrder_idx" ON "Scenario"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

