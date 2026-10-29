-- Align legacy foreign keys with the current Prisma relation rules.
ALTER TABLE "ai_chat_session" DROP CONSTRAINT "ai_chat_session_courseId_fkey";
ALTER TABLE "ai_chat_session" DROP CONSTRAINT "ai_chat_session_courseSessionId_fkey";
ALTER TABLE "course" DROP CONSTRAINT "course_createdBy_fkey";
ALTER TABLE "course_session" DROP CONSTRAINT "course_session_createdBy_fkey";
ALTER TABLE "material" DROP CONSTRAINT "material_uploadedBy_fkey";

ALTER TABLE "course" ADD CONSTRAINT "course_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_session" ADD CONSTRAINT "course_session_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "material" ADD CONSTRAINT "material_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_chat_session" ADD CONSTRAINT "ai_chat_session_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_chat_session" ADD CONSTRAINT "ai_chat_session_courseSessionId_fkey" FOREIGN KEY ("courseSessionId") REFERENCES "course_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
