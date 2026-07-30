-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "centralTenantId" TEXT,
    "centralTenantCode" TEXT,
    "interestRate" DOUBLE PRECISION,
    "penaltyRate" DOUBLE PRECISION,
    "penaltyValue" DOUBLE PRECISION,
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
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "telegramBotToken" TEXT,
    "telegramBotUsername" TEXT,
    "storageProviderAccessKeyId" TEXT,
    "storageProviderSecretAccessKey" TEXT,
    "storageBucketName" TEXT,
    "storageFolderName" TEXT,
    "storageDefaultAcl" TEXT,
    "storageDefaultExpiration" INTEGER,
    "storageRegion" TEXT,
    "storageEndpoint" TEXT,
    "storageCustomEndpoint" TEXT,
    "storageCapacityGb" DOUBLE PRECISION,
    "storageImagesFolderName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_branches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "document" TEXT,
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
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "emailVerificationToken" TEXT,
    "emailVerificationExpires" TIMESTAMP(3),
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "city" TEXT,
    "state" TEXT,
    "neighborhood" TEXT,
    "complement" TEXT,
    "stockControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "stockIntegerQuantityMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "stockLotControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "stockExpirationControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "stockGridControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "stockNegativeControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "allowSaleUnitPriceEdit" BOOLEAN NOT NULL DEFAULT true,
    "allowSaleItemDiscount" BOOLEAN NOT NULL DEFAULT true,
    "groupSameProduct" BOOLEAN NOT NULL DEFAULT true,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpTimeout" INTEGER,
    "smtpAuthenticate" BOOLEAN,
    "smtpSecure" BOOLEAN,
    "smtpAuthType" TEXT,
    "smtpEmail" TEXT,
    "smtpPassword" TEXT,
    "telegramEnabled" BOOLEAN,
    "telegramBotToken" TEXT,
    "telegramBotUsername" TEXT,
    "telegramHeaderImageUrl" TEXT,
    "storageProviderAccessKeyId" TEXT,
    "storageProviderSecretAccessKey" TEXT,
    "storageBucketName" TEXT,
    "storageFolderName" TEXT,
    "storageDefaultAcl" TEXT,
    "storageDefaultExpiration" INTEGER,
    "storageRegion" TEXT,
    "storageEndpoint" TEXT,
    "storageCustomEndpoint" TEXT,
    "storageCapacityGb" DOUBLE PRECISION,
    "storageImagesFolderName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "tenant_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_source_parameter_audit_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "parametersJson" TEXT NOT NULL,
    "performedBy" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "finance_source_parameter_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_processed_updates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_processed_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_pending_actions" (
    "tenantId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TEXT,
    "endDate" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_pending_actions_pkey" PRIMARY KEY ("tenantId","chatId")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT NOT NULL,
    "preferenceKey" TEXT NOT NULL,
    "preferenceValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_settings" (
    "id" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "settingValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "global_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_credentials" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "centralIdentityAccountId" TEXT,
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verificationToken" TEXT,
    "verificationExpires" TIMESTAMP(3),
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "email_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "identityProvider" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "photoUrl" TEXT,
    "complementaryProfiles" TEXT,
    "role" TEXT NOT NULL DEFAULT 'SECRETARIA',
    "accessProfile" TEXT,
    "permissions" TEXT,
    "cashierOnly" BOOLEAN NOT NULL DEFAULT false,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_branch_accesses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "user_branch_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_branch_accesses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "teacher_branch_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_branch_accesses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "student_branch_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_branch_accesses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "guardian_branch_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "rg" TEXT,
    "cpf" TEXT,
    "cpfDigits" TEXT,
    "cnpj" TEXT,
    "cnpjNormalized" TEXT,
    "nickname" TEXT,
    "corporateName" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "cellphone1" TEXT,
    "cellphone2" TEXT,
    "email" TEXT,
    "telegramChatId" TEXT,
    "telegramUsername" TEXT,
    "telegramOptInAt" TIMESTAMP(3),
    "telegramOptOutAt" TIMESTAMP(3),
    "password" TEXT,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "city" TEXT,
    "state" TEXT,
    "neighborhood" TEXT,
    "complement" TEXT,
    "mergedIntoPersonId" TEXT,
    "mergedAt" TIMESTAMP(3),
    "mergedBy" TEXT,
    "mergeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_years" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "year" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "monday" BOOLEAN NOT NULL DEFAULT true,
    "tuesday" BOOLEAN NOT NULL DEFAULT true,
    "wednesday" BOOLEAN NOT NULL DEFAULT true,
    "thursday" BOOLEAN NOT NULL DEFAULT true,
    "friday" BOOLEAN NOT NULL DEFAULT true,
    "saturday" BOOLEAN NOT NULL DEFAULT false,
    "sunday" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "school_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_year_periods" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "periodType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "appliesTo" TEXT NOT NULL DEFAULT 'TODAS AS TURMAS',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "school_year_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_holidays" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "year" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "holidayType" TEXT NOT NULL,
    "appliesTo" TEXT NOT NULL DEFAULT 'TODAS AS TURMAS',
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "school_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "gradeLevel" INTEGER,
    "shift" TEXT NOT NULL,
    "defaultMonthlyFee" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series_classes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "seriesId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "smtpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpTimeout" INTEGER,
    "smtpAuthenticate" BOOLEAN,
    "smtpSecure" BOOLEAN,
    "smtpAuthType" TEXT,
    "smtpEmail" TEXT,
    "smtpPassword" TEXT,
    "smtpSenderName" TEXT,
    "smtpReplyTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "series_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "personId" TEXT,
    "accessProfile" TEXT,
    "permissions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "personId" TEXT,
    "photoUrl" TEXT,
    "accessProfile" TEXT,
    "permissions" TEXT,
    "monthlyFee" DOUBLE PRECISION,
    "billingPayerType" TEXT NOT NULL DEFAULT 'ALUNO',
    "billingGuardianId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_students" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "kinship" TEXT NOT NULL,
    "kinshipDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "guardian_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "seriesClassId" TEXT,
    "schoolYearId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "personId" TEXT,
    "accessProfile" TEXT,
    "permissions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subjects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subject_rate_histories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "teacherSubjectId" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "teacher_subject_rate_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "period" TEXT NOT NULL,
    "lessonNumber" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_schedule_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "schoolYearId" TEXT NOT NULL,
    "seriesClassId" TEXT NOT NULL,
    "teacherSubjectId" TEXT,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "class_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_calendars" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "schoolYearId" TEXT NOT NULL,
    "seriesClassId" TEXT NOT NULL,
    "lastWeeklySyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "lesson_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_calendar_periods" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "lessonCalendarId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "lesson_calendar_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_calendar_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "lessonCalendarId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "seriesClassId" TEXT NOT NULL,
    "teacherSubjectId" TEXT,
    "classScheduleItemId" TEXT,
    "lessonDate" TIMESTAMP(3) NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "lesson_calendar_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "lessonCalendarItemId" TEXT,
    "teacherId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventDate" TIMESTAMP(3),
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
    "notifyByTelegram" BOOLEAN NOT NULL DEFAULT false,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "lesson_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "lessonEventId" TEXT NOT NULL,
    "lessonCalendarItemId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "assessmentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "maxScore" DOUBLE PRECISION,
    "notifyStudents" BOOLEAN NOT NULL DEFAULT true,
    "notifyGuardians" BOOLEAN NOT NULL DEFAULT true,
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyByTelegram" BOOLEAN NOT NULL DEFAULT false,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "lesson_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_assessment_grades" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "lessonAssessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "remarks" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "lesson_assessment_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_attendances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "lessonCalendarItemId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "lesson_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "readAt" TIMESTAMP(3),
    "readBy" TEXT,
    "emailedAt" TIMESTAMP(3),
    "telegramSentAt" TIMESTAMP(3),
    "telegramStatus" TEXT,
    "telegramError" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_campaigns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sendInternal" BOOLEAN NOT NULL DEFAULT true,
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "sendTelegram" BOOLEAN NOT NULL DEFAULT false,
    "recipientGroups" TEXT NOT NULL,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "internalCount" INTEGER NOT NULL DEFAULT 0,
    "emailCount" INTEGER NOT NULL DEFAULT 0,
    "telegramCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,

    CONSTRAINT "communication_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_centralTenantId_key" ON "tenants"("centralTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_centralTenantCode_key" ON "tenants"("centralTenantCode");

-- CreateIndex
CREATE INDEX "tenant_branches_tenantId_isActive_name_idx" ON "tenant_branches"("tenantId", "isActive", "name");

-- CreateIndex
CREATE INDEX "tenant_branches_emailVerificationToken_idx" ON "tenant_branches"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_branches_tenantId_branchCode_key" ON "tenant_branches"("tenantId", "branchCode");

-- CreateIndex
CREATE INDEX "finance_source_parameter_audit_events_tenantId_branchCode_o_idx" ON "finance_source_parameter_audit_events"("tenantId", "branchCode", "occurredAt");

-- CreateIndex
CREATE INDEX "telegram_processed_updates_processedAt_idx" ON "telegram_processed_updates"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_processed_updates_tenantId_updateId_key" ON "telegram_processed_updates"("tenantId", "updateId");

-- CreateIndex
CREATE INDEX "telegram_pending_actions_expiresAt_idx" ON "telegram_pending_actions"("expiresAt");

-- CreateIndex
CREATE INDEX "user_preferences_tenantId_branchCode_userId_idx" ON "user_preferences"("tenantId", "branchCode", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_tenantId_branchCode_userId_preferenceKey_key" ON "user_preferences"("tenantId", "branchCode", "userId", "preferenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "global_settings_settingKey_key" ON "global_settings"("settingKey");

-- CreateIndex
CREATE UNIQUE INDEX "email_credentials_email_key" ON "email_credentials"("email");

-- CreateIndex
CREATE UNIQUE INDEX "email_credentials_centralIdentityAccountId_key" ON "email_credentials"("centralIdentityAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_jti_key" ON "auth_sessions"("jti");

-- CreateIndex
CREATE INDEX "auth_sessions_tenantId_userId_modelType_canceledAt_expiresA_idx" ON "auth_sessions"("tenantId", "userId", "modelType", "canceledAt", "expiresAt");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_canceledAt_idx" ON "auth_sessions"("expiresAt", "canceledAt");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "user_branch_accesses_tenantId_userId_canceledAt_idx" ON "user_branch_accesses"("tenantId", "userId", "canceledAt");

-- CreateIndex
CREATE INDEX "user_branch_accesses_tenantId_branchCode_canceledAt_idx" ON "user_branch_accesses"("tenantId", "branchCode", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_branch_accesses_tenantId_userId_branchCode_key" ON "user_branch_accesses"("tenantId", "userId", "branchCode");

-- CreateIndex
CREATE INDEX "teacher_branch_accesses_tenantId_teacherId_canceledAt_idx" ON "teacher_branch_accesses"("tenantId", "teacherId", "canceledAt");

-- CreateIndex
CREATE INDEX "teacher_branch_accesses_tenantId_branchCode_canceledAt_idx" ON "teacher_branch_accesses"("tenantId", "branchCode", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_branch_accesses_tenantId_teacherId_branchCode_key" ON "teacher_branch_accesses"("tenantId", "teacherId", "branchCode");

-- CreateIndex
CREATE INDEX "student_branch_accesses_tenantId_studentId_canceledAt_idx" ON "student_branch_accesses"("tenantId", "studentId", "canceledAt");

-- CreateIndex
CREATE INDEX "student_branch_accesses_tenantId_branchCode_canceledAt_idx" ON "student_branch_accesses"("tenantId", "branchCode", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "student_branch_accesses_tenantId_studentId_branchCode_key" ON "student_branch_accesses"("tenantId", "studentId", "branchCode");

-- CreateIndex
CREATE INDEX "guardian_branch_accesses_tenantId_guardianId_canceledAt_idx" ON "guardian_branch_accesses"("tenantId", "guardianId", "canceledAt");

-- CreateIndex
CREATE INDEX "guardian_branch_accesses_tenantId_branchCode_canceledAt_idx" ON "guardian_branch_accesses"("tenantId", "branchCode", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_branch_accesses_tenantId_guardianId_branchCode_key" ON "guardian_branch_accesses"("tenantId", "guardianId", "branchCode");

-- CreateIndex
CREATE INDEX "people_tenantId_idx" ON "people"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "people_tenantId_cpfDigits_key" ON "people"("tenantId", "cpfDigits");

-- CreateIndex
CREATE UNIQUE INDEX "people_tenantId_cnpjNormalized_key" ON "people"("tenantId", "cnpjNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "people_tenantId_telegramChatId_key" ON "people"("tenantId", "telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "school_years_tenantId_branchCode_year_key" ON "school_years"("tenantId", "branchCode", "year");

-- CreateIndex
CREATE INDEX "school_year_periods_tenantId_idx" ON "school_year_periods"("tenantId");

-- CreateIndex
CREATE INDEX "school_year_periods_tenantId_branchCode_schoolYearId_idx" ON "school_year_periods"("tenantId", "branchCode", "schoolYearId");

-- CreateIndex
CREATE INDEX "school_year_periods_startDate_endDate_idx" ON "school_year_periods"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "school_holidays_tenantId_idx" ON "school_holidays"("tenantId");

-- CreateIndex
CREATE INDEX "school_holidays_tenantId_branchCode_year_idx" ON "school_holidays"("tenantId", "branchCode", "year");

-- CreateIndex
CREATE INDEX "school_holidays_date_idx" ON "school_holidays"("date");

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
CREATE UNIQUE INDEX "schedules_tenantId_branchCode_period_lessonNumber_key" ON "schedules"("tenantId", "branchCode", "period", "lessonNumber");

-- CreateIndex
CREATE INDEX "class_schedule_items_tenantId_idx" ON "class_schedule_items"("tenantId");

-- CreateIndex
CREATE INDEX "class_schedule_items_schoolYearId_idx" ON "class_schedule_items"("schoolYearId");

-- CreateIndex
CREATE INDEX "class_schedule_items_seriesClassId_idx" ON "class_schedule_items"("seriesClassId");

-- CreateIndex
CREATE INDEX "class_schedule_items_teacherSubjectId_idx" ON "class_schedule_items"("teacherSubjectId");

-- CreateIndex
CREATE UNIQUE INDEX "class_schedule_items_tenantId_branchCode_schoolYearId_serie_key" ON "class_schedule_items"("tenantId", "branchCode", "schoolYearId", "seriesClassId", "teacherSubjectId", "dayOfWeek", "startTime", "endTime");

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

-- AddForeignKey
ALTER TABLE "tenant_branches" ADD CONSTRAINT "tenant_branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_source_parameter_audit_events" ADD CONSTRAINT "finance_source_parameter_audit_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_processed_updates" ADD CONSTRAINT "telegram_processed_updates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_pending_actions" ADD CONSTRAINT "telegram_pending_actions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch_accesses" ADD CONSTRAINT "user_branch_accesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch_accesses" ADD CONSTRAINT "user_branch_accesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_branch_accesses" ADD CONSTRAINT "teacher_branch_accesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_branch_accesses" ADD CONSTRAINT "teacher_branch_accesses_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_branch_accesses" ADD CONSTRAINT "student_branch_accesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_branch_accesses" ADD CONSTRAINT "student_branch_accesses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_branch_accesses" ADD CONSTRAINT "guardian_branch_accesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_branch_accesses" ADD CONSTRAINT "guardian_branch_accesses_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_year_periods" ADD CONSTRAINT "school_year_periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_year_periods" ADD CONSTRAINT "school_year_periods_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_holidays" ADD CONSTRAINT "school_holidays_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series" ADD CONSTRAINT "series_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_classes" ADD CONSTRAINT "series_classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_classes" ADD CONSTRAINT "series_classes_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_classes" ADD CONSTRAINT "series_classes_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_billingGuardianId_fkey" FOREIGN KEY ("billingGuardianId") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_students" ADD CONSTRAINT "guardian_students_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_students" ADD CONSTRAINT "guardian_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_students" ADD CONSTRAINT "guardian_students_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_seriesClassId_fkey" FOREIGN KEY ("seriesClassId") REFERENCES "series_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_rate_histories" ADD CONSTRAINT "teacher_subject_rate_histories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_rate_histories" ADD CONSTRAINT "teacher_subject_rate_histories_teacherSubjectId_fkey" FOREIGN KEY ("teacherSubjectId") REFERENCES "teacher_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_items" ADD CONSTRAINT "class_schedule_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_items" ADD CONSTRAINT "class_schedule_items_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_items" ADD CONSTRAINT "class_schedule_items_seriesClassId_fkey" FOREIGN KEY ("seriesClassId") REFERENCES "series_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_items" ADD CONSTRAINT "class_schedule_items_teacherSubjectId_fkey" FOREIGN KEY ("teacherSubjectId") REFERENCES "teacher_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_calendars" ADD CONSTRAINT "lesson_calendars_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_calendars" ADD CONSTRAINT "lesson_calendars_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_calendars" ADD CONSTRAINT "lesson_calendars_seriesClassId_fkey" FOREIGN KEY ("seriesClassId") REFERENCES "series_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_calendar_periods" ADD CONSTRAINT "lesson_calendar_periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_calendar_periods" ADD CONSTRAINT "lesson_calendar_periods_lessonCalendarId_fkey" FOREIGN KEY ("lessonCalendarId") REFERENCES "lesson_calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_calendar_items" ADD CONSTRAINT "lesson_calendar_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_calendar_items" ADD CONSTRAINT "lesson_calendar_items_lessonCalendarId_fkey" FOREIGN KEY ("lessonCalendarId") REFERENCES "lesson_calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_calendar_items" ADD CONSTRAINT "lesson_calendar_items_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_calendar_items" ADD CONSTRAINT "lesson_calendar_items_seriesClassId_fkey" FOREIGN KEY ("seriesClassId") REFERENCES "series_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_calendar_items" ADD CONSTRAINT "lesson_calendar_items_teacherSubjectId_fkey" FOREIGN KEY ("teacherSubjectId") REFERENCES "teacher_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_calendar_items" ADD CONSTRAINT "lesson_calendar_items_classScheduleItemId_fkey" FOREIGN KEY ("classScheduleItemId") REFERENCES "class_schedule_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_events" ADD CONSTRAINT "lesson_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_events" ADD CONSTRAINT "lesson_events_lessonCalendarItemId_fkey" FOREIGN KEY ("lessonCalendarItemId") REFERENCES "lesson_calendar_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_events" ADD CONSTRAINT "lesson_events_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_assessments" ADD CONSTRAINT "lesson_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_assessments" ADD CONSTRAINT "lesson_assessments_lessonEventId_fkey" FOREIGN KEY ("lessonEventId") REFERENCES "lesson_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_assessments" ADD CONSTRAINT "lesson_assessments_lessonCalendarItemId_fkey" FOREIGN KEY ("lessonCalendarItemId") REFERENCES "lesson_calendar_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_assessments" ADD CONSTRAINT "lesson_assessments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_assessment_grades" ADD CONSTRAINT "lesson_assessment_grades_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_assessment_grades" ADD CONSTRAINT "lesson_assessment_grades_lessonAssessmentId_fkey" FOREIGN KEY ("lessonAssessmentId") REFERENCES "lesson_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_assessment_grades" ADD CONSTRAINT "lesson_assessment_grades_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_attendances" ADD CONSTRAINT "lesson_attendances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_attendances" ADD CONSTRAINT "lesson_attendances_lessonCalendarItemId_fkey" FOREIGN KEY ("lessonCalendarItemId") REFERENCES "lesson_calendar_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_attendances" ADD CONSTRAINT "lesson_attendances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_attendances" ADD CONSTRAINT "lesson_attendances_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_campaigns" ADD CONSTRAINT "communication_campaigns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
