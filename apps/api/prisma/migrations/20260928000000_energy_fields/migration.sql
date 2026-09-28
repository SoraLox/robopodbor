-- Энергопрофиль решения для симуляции: время зарядки, запас энергии батареи, мощность.
ALTER TABLE "CatalogSolution" ADD COLUMN "chargeHours" DOUBLE PRECISION;
ALTER TABLE "CatalogSolution" ADD COLUMN "batteryKwh" DOUBLE PRECISION;
ALTER TABLE "CatalogSolution" ADD COLUMN "powerKw" DOUBLE PRECISION;
