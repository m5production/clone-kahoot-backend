/*
  Warnings:

  - You are about to alter the column `text` on the `AcceptedAnswer` table. The data in that column could be lost. The data in that column will be cast from `VarChar(200)` to `VarChar(100)`.
  - You are about to alter the column `text` on the `Question` table. The data in that column could be lost. The data in that column will be cast from `VarChar(500)` to `VarChar(300)`.

*/
-- AlterTable
ALTER TABLE "AcceptedAnswer" ALTER COLUMN "text" SET DATA TYPE VARCHAR(100);

-- AlterTable: existing games get generated titles "Quiz #<n>" per owner in
-- creation order (BR-44 requires a title); new games always provide one.
ALTER TABLE "Game" ADD COLUMN "title" VARCHAR(80),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Game" AS g
SET "title" = 'Quiz #' || numbered.rn
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "adminId" ORDER BY "createdAt", "id") AS rn
  FROM "Game"
) AS numbered
WHERE g."id" = numbered."id";

ALTER TABLE "Game" ALTER COLUMN "title" SET NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Question" ALTER COLUMN "text" SET DATA TYPE VARCHAR(300);
