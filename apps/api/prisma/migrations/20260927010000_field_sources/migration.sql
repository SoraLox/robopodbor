-- Происхождение каждой характеристики решения (ТЗ 3.3.4).
ALTER TABLE "CatalogSolution" ADD COLUMN "fieldSources" JSONB;
