-- The quiz editor creates an empty placeholder question and fills it later,
-- so Question.text may be empty until the editor saves it.
ALTER TABLE "Question" DROP CONSTRAINT "Question_text_not_empty";
