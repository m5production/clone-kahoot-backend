-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "img" VARCHAR(2048),
    "text" VARCHAR(500) NOT NULL,
    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AcceptedAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    CONSTRAINT "AcceptedAnswer_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");
-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
-- CreateIndex
CREATE INDEX "Game_adminId_idx" ON "Game"("adminId");
-- CreateIndex
CREATE INDEX "Question_gameId_idx" ON "Question"("gameId");
-- CreateIndex
CREATE UNIQUE INDEX "Question_gameId_order_key" ON "Question"("gameId", "order");
-- CreateIndex
CREATE INDEX "AcceptedAnswer_questionId_idx" ON "AcceptedAnswer"("questionId");
-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AcceptedAnswer" ADD CONSTRAINT "AcceptedAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Non-empty value constraints in addition to application-level validation
ALTER TABLE "User" ADD CONSTRAINT "User_name_not_empty" CHECK (btrim("name") <> '');
ALTER TABLE "Question" ADD CONSTRAINT "Question_text_not_empty" CHECK (btrim("text") <> '');
ALTER TABLE "AcceptedAnswer" ADD CONSTRAINT "AcceptedAnswer_text_not_empty" CHECK (btrim("text") <> '');
