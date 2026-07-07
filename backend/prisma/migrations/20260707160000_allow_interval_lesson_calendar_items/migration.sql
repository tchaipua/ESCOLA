-- Permite representar intervalos na grade anual sem professor x matéria.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_lesson_calendar_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "lessonCalendarId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "seriesClassId" TEXT NOT NULL,
    "teacherSubjectId" TEXT,
    "classScheduleItemId" TEXT,
    "lessonDate" DATETIME NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "hourlyRate" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "lesson_calendar_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_calendar_items_lessonCalendarId_fkey" FOREIGN KEY ("lessonCalendarId") REFERENCES "lesson_calendars" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_calendar_items_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "school_years" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_calendar_items_seriesClassId_fkey" FOREIGN KEY ("seriesClassId") REFERENCES "series_classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_calendar_items_teacherSubjectId_fkey" FOREIGN KEY ("teacherSubjectId") REFERENCES "teacher_subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_calendar_items_classScheduleItemId_fkey" FOREIGN KEY ("classScheduleItemId") REFERENCES "class_schedule_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_lesson_calendar_items" (
    "id",
    "tenantId",
    "branchCode",
    "lessonCalendarId",
    "schoolYearId",
    "seriesClassId",
    "teacherSubjectId",
    "classScheduleItemId",
    "lessonDate",
    "dayOfWeek",
    "startTime",
    "endTime",
    "hourlyRate",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "canceledAt",
    "canceledBy"
)
SELECT
    "id",
    "tenantId",
    "branchCode",
    "lessonCalendarId",
    "schoolYearId",
    "seriesClassId",
    "teacherSubjectId",
    "classScheduleItemId",
    "lessonDate",
    "dayOfWeek",
    "startTime",
    "endTime",
    "hourlyRate",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "canceledAt",
    "canceledBy"
FROM "lesson_calendar_items";

DROP TABLE "lesson_calendar_items";
ALTER TABLE "new_lesson_calendar_items" RENAME TO "lesson_calendar_items";

CREATE INDEX "lesson_calendar_items_tenantId_idx" ON "lesson_calendar_items"("tenantId");
CREATE INDEX "lesson_calendar_items_lessonCalendarId_idx" ON "lesson_calendar_items"("lessonCalendarId");
CREATE INDEX "lesson_calendar_items_schoolYearId_idx" ON "lesson_calendar_items"("schoolYearId");
CREATE INDEX "lesson_calendar_items_seriesClassId_idx" ON "lesson_calendar_items"("seriesClassId");
CREATE INDEX "lesson_calendar_items_teacherSubjectId_idx" ON "lesson_calendar_items"("teacherSubjectId");
CREATE INDEX "lesson_calendar_items_classScheduleItemId_idx" ON "lesson_calendar_items"("classScheduleItemId");
CREATE INDEX "lesson_calendar_items_lessonDate_idx" ON "lesson_calendar_items"("lessonDate");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
