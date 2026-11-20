-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "timeLimitSec" SMALLINT NOT NULL DEFAULT 20;

-- BR-48: the time limit is restricted to a fixed set of values
ALTER TABLE "Question" ADD CONSTRAINT "question_time_limit_sec_check"
  CHECK ("timeLimitSec" IN (10, 20, 30, 60, 90, 120));
