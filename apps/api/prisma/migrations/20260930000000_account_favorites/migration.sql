-- Личный кабинет: избранные роботы каталога и дата последней смены пароля.
ALTER TABLE "User" ADD COLUMN "favoriteSolutionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
