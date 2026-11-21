-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "type" VARCHAR(16) NOT NULL DEFAULT 'open';

-- D-10: the question type is a fixed set ('open', 'choice'); prisma cannot
-- express CHECK constraints, so this is raw SQL
ALTER TABLE "Question" ADD CONSTRAINT "question_type_check"
  CHECK ("type" IN ('open', 'choice'));

-- AlterTable
ALTER TABLE "SessionQuestion" ADD COLUMN     "options" JSONB,
ADD COLUMN     "type" VARCHAR(16) NOT NULL DEFAULT 'open';

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" VARCHAR(100) NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_order_key" ON "QuestionOption"("questionId", "order");

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
