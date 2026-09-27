-- Каталог роботов: категория, УГТ, фото и основание применимости к типу объекта.
ALTER TABLE "CatalogSolution" ADD COLUMN "catalogCategory" TEXT;
ALTER TABLE "CatalogSolution" ADD COLUMN "trl" INTEGER;
ALTER TABLE "CatalogSolution" ADD COLUMN "photos" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CatalogSolution" ADD COLUMN "objectFit" JSONB;
