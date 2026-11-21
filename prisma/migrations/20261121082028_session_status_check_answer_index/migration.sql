-- Session status is a fixed set written by the app ('running', 'finished',
-- 'aborted'); prisma cannot express CHECK constraints, so this is raw SQL
ALTER TABLE "GameSession"
    ADD CONSTRAINT "GameSession_status_check"
    CHECK (status IN ('running', 'finished', 'aborted'));

-- CreateIndex
CREATE INDEX "SessionAnswer_sessionQuestionId_idx" ON "SessionAnswer"("sessionQuestionId");
