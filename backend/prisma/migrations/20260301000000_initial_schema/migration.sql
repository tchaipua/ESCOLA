-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "logoUrl" TEXT,
    "birthDate" DATETIME,
    "rg" TEXT,
    "cpf" TEXT,
    "cnpj" TEXT,
    "nickname" TEXT,
    "corporateName" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "cellphone1" TEXT,
    "cellphone2" TEXT,
    "email" TEXT,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "city" TEXT,
    "state" TEXT,
    "neighborhood" TEXT,
    "complement" TEXT,
    "interestRate" REAL,
    "penaltyRate" REAL,
    "penaltyValue" REAL,
    "penaltyGracePeriod" INTEGER,
    "interestGracePeriod" INTEGER,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpTimeout" INTEGER,
    "smtpAuthenticate" BOOLEAN,
    "smtpSecure" BOOLEAN,
    "smtpAuthType" TEXT,
    "smtpEmail" TEXT,
    "smtpPassword" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferenceKey" TEXT NOT NULL,
    "preferenceValue" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "user_preferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "global_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settingKey" TEXT NOT NULL,
    "settingValue" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT
);

-- CreateTable
CREATE TABLE "email_credentials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" DATETIME,
    "verificationToken" TEXT,
    "verificationExpires" DATETIME,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "photoUrl" TEXT,
    "complementaryProfiles" TEXT,
    "role" TEXT NOT NULL DEFAULT 'SECRETARIA',
    "accessProfile" TEXT,
    "permissions" TEXT,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" DATETIME,
    "rg" TEXT,
    "cpf" TEXT,
    "cpfDigits" TEXT,
    "cnpj" TEXT,
    "nickname" TEXT,
    "corporateName" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "cellphone1" TEXT,
    "cellphone2" TEXT,
    "email" TEXT,
    "password" TEXT,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" DATETIME,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "city" TEXT,
    "state" TEXT,
    "neighborhood" TEXT,
    "complement" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "people_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "school_years" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "school_years_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" INTEGER,
    "shift" TEXT NOT NULL,
    "defaultMonthlyFee" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "series" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "series_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "series_classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "series_classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "series_classes_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "series" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "series_classes_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT,
    "name" TEXT NOT NULL,
    "birthDate" DATETIME,
    "rg" TEXT,
    "cpf" TEXT,
    "cnpj" TEXT,
    "nickname" TEXT,
    "corporateName" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "cellphone1" TEXT,
    "cellphone2" TEXT,
    "email" TEXT,
    "accessProfile" TEXT,
    "permissions" TEXT,
    "password" TEXT,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" DATETIME,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "city" TEXT,
    "state" TEXT,
    "neighborhood" TEXT,
    "complement" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "guardians_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "guardians_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "birthDate" DATETIME,
    "rg" TEXT,
    "cpf" TEXT,
    "cnpj" TEXT,
    "nickname" TEXT,
    "corporateName" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "cellphone1" TEXT,
    "cellphone2" TEXT,
    "email" TEXT,
    "accessProfile" TEXT,
    "permissions" TEXT,
    "monthlyFee" REAL,
    "billingPayerType" TEXT NOT NULL DEFAULT 'ALUNO',
    "billingGuardianId" TEXT,
    "notes" TEXT,
    "password" TEXT,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" DATETIME,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "city" TEXT,
    "state" TEXT,
    "neighborhood" TEXT,
    "complement" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "students_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "students_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "students_billingGuardianId_fkey" FOREIGN KEY ("billingGuardianId") REFERENCES "guardians" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "guardian_students" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "kinship" TEXT NOT NULL,
    "kinshipDescription" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "guardian_students_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "guardian_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "guardian_students_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "seriesClassId" TEXT,
    "schoolYearId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "enrollments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "enrollments_seriesClassId_fkey" FOREIGN KEY ("seriesClassId") REFERENCES "series_classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "enrollments_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "school_years" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT,
    "name" TEXT NOT NULL,
    "birthDate" DATETIME,
    "rg" TEXT,
    "cpf" TEXT,
    "cnpj" TEXT,
    "nickname" TEXT,
    "corporateName" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "cellphone1" TEXT,
    "cellphone2" TEXT,
    "email" TEXT,
    "accessProfile" TEXT,
    "permissions" TEXT,
    "password" TEXT,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" DATETIME,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "city" TEXT,
    "state" TEXT,
    "neighborhood" TEXT,
    "complement" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "teachers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "teachers_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "teacher_subjects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "hourlyRate" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "teacher_subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "teacher_subjects_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "teacher_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "teacher_subject_rate_histories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "teacherSubjectId" TEXT NOT NULL,
    "hourlyRate" REAL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "teacher_subject_rate_histories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "teacher_subject_rate_histories_teacherSubjectId_fkey" FOREIGN KEY ("teacherSubjectId") REFERENCES "teacher_subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "lessonNumber" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "class_schedule_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "seriesClassId" TEXT NOT NULL,
    "teacherSubjectId" TEXT,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "class_schedule_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "class_schedule_items_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "school_years" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "class_schedule_items_seriesClassId_fkey" FOREIGN KEY ("seriesClassId") REFERENCES "series_classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "class_schedule_items_teacherSubjectId_fkey" FOREIGN KEY ("teacherSubjectId") REFERENCES "teacher_subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lesson_calendars" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "seriesClassId" TEXT NOT NULL,
    "lastWeeklySyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "lesson_calendars_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_calendars_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "school_years" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_calendars_seriesClassId_fkey" FOREIGN KEY ("seriesClassId") REFERENCES "series_classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lesson_calendar_periods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "lessonCalendarId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "lesson_calendar_periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_calendar_periods_lessonCalendarId_fkey" FOREIGN KEY ("lessonCalendarId") REFERENCES "lesson_calendars" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lesson_calendar_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "lessonCalendarId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "seriesClassId" TEXT NOT NULL,
    "teacherSubjectId" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "lesson_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "lessonCalendarItemId" TEXT,
    "teacherId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventDate" DATETIME,
    "schoolYearId" TEXT,
    "seriesClassId" TEXT,
    "teacherSubjectId" TEXT,
    "subjectNameSnapshot" TEXT,
    "seriesNameSnapshot" TEXT,
    "classNameSnapshot" TEXT,
    "shiftSnapshot" TEXT,
    "notifyStudents" BOOLEAN NOT NULL DEFAULT true,
    "notifyGuardians" BOOLEAN NOT NULL DEFAULT true,
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
    "lastNotifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "lesson_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_events_lessonCalendarItemId_fkey" FOREIGN KEY ("lessonCalendarItemId") REFERENCES "lesson_calendar_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_events_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lesson_assessments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "lessonEventId" TEXT NOT NULL,
    "lessonCalendarItemId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "assessmentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "maxScore" REAL,
    "notifyStudents" BOOLEAN NOT NULL DEFAULT true,
    "notifyGuardians" BOOLEAN NOT NULL DEFAULT true,
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
    "lastNotifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "lesson_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_assessments_lessonEventId_fkey" FOREIGN KEY ("lessonEventId") REFERENCES "lesson_events" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_assessments_lessonCalendarItemId_fkey" FOREIGN KEY ("lessonCalendarItemId") REFERENCES "lesson_calendar_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_assessments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lesson_assessment_grades" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "lessonAssessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" REAL,
    "remarks" TEXT,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "lesson_assessment_grades_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_assessment_grades_lessonAssessmentId_fkey" FOREIGN KEY ("lessonAssessmentId") REFERENCES "lesson_assessments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_assessment_grades_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lesson_attendances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "lessonCalendarItemId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "lesson_attendances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_attendances_lessonCalendarItemId_fkey" FOREIGN KEY ("lessonCalendarItemId") REFERENCES "lesson_calendar_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_attendances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lesson_attendances_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "readAt" DATETIME,
    "readBy" TEXT,
    "emailedAt" DATETIME,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "communication_campaigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sendInternal" BOOLEAN NOT NULL DEFAULT true,
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "recipientGroups" TEXT NOT NULL,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "internalCount" INTEGER NOT NULL DEFAULT 0,
    "emailCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "communication_campaigns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_document_key" ON "tenants"("document");

-- CreateIndex
CREATE INDEX "user_preferences_tenantId_userId_idx" ON "user_preferences"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_tenantId_userId_preferenceKey_key" ON "user_preferences"("tenantId", "userId", "preferenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "global_settings_settingKey_key" ON "global_settings"("settingKey");

-- CreateIndex
CREATE UNIQUE INDEX "email_credentials_email_key" ON "email_credentials"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "people_tenantId_idx" ON "people"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "people_tenantId_cpfDigits_key" ON "people"("tenantId", "cpfDigits");

-- CreateIndex
CREATE UNIQUE INDEX "school_years_tenantId_year_key" ON "school_years"("tenantId", "year");

-- CreateIndex
CREATE INDEX "classes_tenantId_idx" ON "classes"("tenantId");

-- CreateIndex
CREATE INDEX "series_tenantId_idx" ON "series"("tenantId");

-- CreateIndex
CREATE INDEX "series_classes_tenantId_idx" ON "series_classes"("tenantId");

-- CreateIndex
CREATE INDEX "series_classes_seriesId_idx" ON "series_classes"("seriesId");

-- CreateIndex
CREATE INDEX "series_classes_classId_idx" ON "series_classes"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "series_classes_seriesId_classId_key" ON "series_classes"("seriesId", "classId");

-- CreateIndex
CREATE INDEX "guardians_tenantId_idx" ON "guardians"("tenantId");

-- CreateIndex
CREATE INDEX "guardians_personId_idx" ON "guardians"("personId");

-- CreateIndex
CREATE INDEX "students_tenantId_idx" ON "students"("tenantId");

-- CreateIndex
CREATE INDEX "students_personId_idx" ON "students"("personId");

-- CreateIndex
CREATE INDEX "students_billingGuardianId_idx" ON "students"("billingGuardianId");

-- CreateIndex
CREATE INDEX "guardian_students_tenantId_idx" ON "guardian_students"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_students_studentId_guardianId_key" ON "guardian_students"("studentId", "guardianId");

-- CreateIndex
CREATE INDEX "enrollments_tenantId_idx" ON "enrollments"("tenantId");

-- CreateIndex
CREATE INDEX "enrollments_schoolYearId_idx" ON "enrollments"("schoolYearId");

-- CreateIndex
CREATE INDEX "enrollments_seriesClassId_idx" ON "enrollments"("seriesClassId");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_studentId_schoolYearId_key" ON "enrollments"("studentId", "schoolYearId");

-- CreateIndex
CREATE INDEX "teachers_tenantId_idx" ON "teachers"("tenantId");

-- CreateIndex
CREATE INDEX "teachers_personId_idx" ON "teachers"("personId");

-- CreateIndex
CREATE INDEX "subjects_tenantId_idx" ON "subjects"("tenantId");

-- CreateIndex
CREATE INDEX "teacher_subjects_tenantId_idx" ON "teacher_subjects"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_subjects_teacherId_subjectId_key" ON "teacher_subjects"("teacherId", "subjectId");

-- CreateIndex
CREATE INDEX "teacher_subject_rate_histories_tenantId_idx" ON "teacher_subject_rate_histories"("tenantId");

-- CreateIndex
CREATE INDEX "teacher_subject_rate_histories_teacherSubjectId_idx" ON "teacher_subject_rate_histories"("teacherSubjectId");

-- CreateIndex
CREATE INDEX "teacher_subject_rate_histories_effectiveFrom_idx" ON "teacher_subject_rate_histories"("effectiveFrom");

-- CreateIndex
CREATE INDEX "schedules_tenantId_idx" ON "schedules"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_tenantId_period_lessonNumber_key" ON "schedules"("tenantId", "period", "lessonNumber");

-- CreateIndex
CREATE INDEX "class_schedule_items_tenantId_idx" ON "class_schedule_items"("tenantId");

-- CreateIndex
CREATE INDEX "class_schedule_items_schoolYearId_idx" ON "class_schedule_items"("schoolYearId");

-- CreateIndex
CREATE INDEX "class_schedule_items_seriesClassId_idx" ON "class_schedule_items"("seriesClassId");

-- CreateIndex
CREATE INDEX "class_schedule_items_teacherSubjectId_idx" ON "class_schedule_items"("teacherSubjectId");

-- CreateIndex
CREATE UNIQUE INDEX "class_schedule_items_tenantId_schoolYearId_seriesClassId_teacherSubjectId_dayOfWeek_startTime_endTime_key" ON "class_schedule_items"("tenantId", "schoolYearId", "seriesClassId", "teacherSubjectId", "dayOfWeek", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "lesson_calendars_tenantId_idx" ON "lesson_calendars"("tenantId");

-- CreateIndex
CREATE INDEX "lesson_calendars_schoolYearId_idx" ON "lesson_calendars"("schoolYearId");

-- CreateIndex
CREATE INDEX "lesson_calendars_seriesClassId_idx" ON "lesson_calendars"("seriesClassId");

-- CreateIndex
CREATE INDEX "lesson_calendar_periods_tenantId_idx" ON "lesson_calendar_periods"("tenantId");

-- CreateIndex
CREATE INDEX "lesson_calendar_periods_lessonCalendarId_idx" ON "lesson_calendar_periods"("lessonCalendarId");

-- CreateIndex
CREATE INDEX "lesson_calendar_items_tenantId_idx" ON "lesson_calendar_items"("tenantId");

-- CreateIndex
CREATE INDEX "lesson_calendar_items_lessonCalendarId_idx" ON "lesson_calendar_items"("lessonCalendarId");

-- CreateIndex
CREATE INDEX "lesson_calendar_items_schoolYearId_idx" ON "lesson_calendar_items"("schoolYearId");

-- CreateIndex
CREATE INDEX "lesson_calendar_items_seriesClassId_idx" ON "lesson_calendar_items"("seriesClassId");

-- CreateIndex
CREATE INDEX "lesson_calendar_items_teacherSubjectId_idx" ON "lesson_calendar_items"("teacherSubjectId");

-- CreateIndex
CREATE INDEX "lesson_calendar_items_classScheduleItemId_idx" ON "lesson_calendar_items"("classScheduleItemId");

-- CreateIndex
CREATE INDEX "lesson_events_tenantId_idx" ON "lesson_events"("tenantId");

-- CreateIndex
CREATE INDEX "lesson_events_lessonCalendarItemId_idx" ON "lesson_events"("lessonCalendarItemId");

-- CreateIndex
CREATE INDEX "lesson_events_teacherId_idx" ON "lesson_events"("teacherId");

-- CreateIndex
CREATE INDEX "lesson_events_eventDate_idx" ON "lesson_events"("eventDate");

-- CreateIndex
CREATE INDEX "lesson_events_schoolYearId_seriesClassId_idx" ON "lesson_events"("schoolYearId", "seriesClassId");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_assessments_lessonEventId_key" ON "lesson_assessments"("lessonEventId");

-- CreateIndex
CREATE INDEX "lesson_assessments_tenantId_idx" ON "lesson_assessments"("tenantId");

-- CreateIndex
CREATE INDEX "lesson_assessments_lessonCalendarItemId_idx" ON "lesson_assessments"("lessonCalendarItemId");

-- CreateIndex
CREATE INDEX "lesson_assessments_teacherId_idx" ON "lesson_assessments"("teacherId");

-- CreateIndex
CREATE INDEX "lesson_assessment_grades_tenantId_idx" ON "lesson_assessment_grades"("tenantId");

-- CreateIndex
CREATE INDEX "lesson_assessment_grades_lessonAssessmentId_idx" ON "lesson_assessment_grades"("lessonAssessmentId");

-- CreateIndex
CREATE INDEX "lesson_assessment_grades_studentId_idx" ON "lesson_assessment_grades"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_assessment_grades_lessonAssessmentId_studentId_key" ON "lesson_assessment_grades"("lessonAssessmentId", "studentId");

-- CreateIndex
CREATE INDEX "lesson_attendances_tenantId_idx" ON "lesson_attendances"("tenantId");

-- CreateIndex
CREATE INDEX "lesson_attendances_lessonCalendarItemId_idx" ON "lesson_attendances"("lessonCalendarItemId");

-- CreateIndex
CREATE INDEX "lesson_attendances_studentId_idx" ON "lesson_attendances"("studentId");

-- CreateIndex
CREATE INDEX "lesson_attendances_teacherId_idx" ON "lesson_attendances"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_attendances_lessonCalendarItemId_studentId_key" ON "lesson_attendances"("lessonCalendarItemId", "studentId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "notifications_recipientType_recipientId_idx" ON "notifications"("recipientType", "recipientId");

-- CreateIndex
CREATE INDEX "notifications_readAt_idx" ON "notifications"("readAt");

-- CreateIndex
CREATE INDEX "communication_campaigns_tenantId_idx" ON "communication_campaigns"("tenantId");

-- CreateIndex
CREATE INDEX "communication_campaigns_senderType_senderId_idx" ON "communication_campaigns"("senderType", "senderId");


-- Legacy financial launch tables kept only so the pending cleanup migration can run on a clean database.
CREATE TABLE "student_financial_launch_batches" (
    "id" TEXT NOT NULL PRIMARY KEY
);

CREATE TABLE "student_financial_launch_items" (
    "id" TEXT NOT NULL PRIMARY KEY
);
