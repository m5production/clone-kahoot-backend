-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "gameId" TEXT,
    "hostId" TEXT NOT NULL,
    "quizTitle" VARCHAR(80) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" VARCHAR(300) NOT NULL,
    "img" VARCHAR(2048),
    "timeLimitSec" SMALLINT NOT NULL,
    "acceptedAnswers" JSONB NOT NULL,

    CONSTRAINT "SessionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionPlayer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" VARCHAR(64) NOT NULL,
    "color" VARCHAR(32) NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "correctTimeMs" INTEGER NOT NULL DEFAULT 0,
    "place" INTEGER,

    CONSTRAINT "SessionPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionAnswer" (
    "id" TEXT NOT NULL,
    "sessionPlayerId" TEXT NOT NULL,
    "sessionQuestionId" TEXT NOT NULL,
    "text" VARCHAR(100) NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "SessionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameSession_hostId_idx" ON "GameSession"("hostId");

-- CreateIndex
CREATE INDEX "GameSession_gameId_idx" ON "GameSession"("gameId");

-- CreateIndex
CREATE INDEX "SessionQuestion_sessionId_idx" ON "SessionQuestion"("sessionId");

-- CreateIndex
CREATE INDEX "SessionPlayer_sessionId_idx" ON "SessionPlayer"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionPlayer_sessionId_userId_key" ON "SessionPlayer"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionAnswer_sessionPlayerId_sessionQuestionId_key" ON "SessionAnswer"("sessionPlayerId", "sessionQuestionId");

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionQuestion" ADD CONSTRAINT "SessionQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPlayer" ADD CONSTRAINT "SessionPlayer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPlayer" ADD CONSTRAINT "SessionPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAnswer" ADD CONSTRAINT "SessionAnswer_sessionPlayerId_fkey" FOREIGN KEY ("sessionPlayerId") REFERENCES "SessionPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAnswer" ADD CONSTRAINT "SessionAnswer_sessionQuestionId_fkey" FOREIGN KEY ("sessionQuestionId") REFERENCES "SessionQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
