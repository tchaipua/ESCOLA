-- CreateTable
CREATE TABLE "tenant_branches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "tenant_branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_user_preferences" ("canceledAt", "canceledBy", "createdAt", "createdBy", "id", "preferenceKey", "preferenceValue", "tenantId", "updatedAt", "updatedBy", "userId") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "id", "preferenceKey", "preferenceValue", "tenantId", "updatedAt", "updatedBy", "userId" FROM "user_preferences";
DROP TABLE "user_preferences";
ALTER TABLE "new_user_preferences" RENAME TO "user_preferences";
CREATE INDEX "user_preferences_tenantId_branchCode_userId_idx" ON "user_preferences"("tenantId", "branchCode", "userId");
CREATE UNIQUE INDEX "user_preferences_tenantId_branchCode_userId_preferenceKey_key" ON "user_preferences"("tenantId", "branchCode", "userId", "preferenceKey");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
INSERT INTO "new_users" ("accessProfile", "canceledAt", "canceledBy", "complementaryProfiles", "createdAt", "createdBy", "email", "id", "name", "password", "permissions", "photoUrl", "resetPasswordExpires", "resetPasswordToken", "role", "tenantId", "updatedAt", "updatedBy") SELECT "accessProfile", "canceledAt", "canceledBy", "complementaryProfiles", "createdAt", "createdBy", "email", "id", "name", "password", "permissions", "photoUrl", "resetPasswordExpires", "resetPasswordToken", "role", "tenantId", "updatedAt", "updatedBy" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");
CREATE TABLE "new_people" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_people" ("birthDate", "canceledAt", "canceledBy", "cellphone1", "cellphone2", "city", "cnpj", "complement", "corporateName", "cpf", "cpfDigits", "createdAt", "createdBy", "email", "id", "name", "neighborhood", "nickname", "number", "password", "phone", "resetPasswordExpires", "resetPasswordToken", "rg", "state", "street", "tenantId", "updatedAt", "updatedBy", "whatsapp", "zipCode") SELECT "birthDate", "canceledAt", "canceledBy", "cellphone1", "cellphone2", "city", "cnpj", "complement", "corporateName", "cpf", "cpfDigits", "createdAt", "createdBy", "email", "id", "name", "neighborhood", "nickname", "number", "password", "phone", "resetPasswordExpires", "resetPasswordToken", "rg", "state", "street", "tenantId", "updatedAt", "updatedBy", "whatsapp", "zipCode" FROM "people";
DROP TABLE "people";
ALTER TABLE "new_people" RENAME TO "people";
CREATE INDEX "people_tenantId_idx" ON "people"("tenantId");
CREATE UNIQUE INDEX "people_tenantId_branchCode_cpfDigits_key" ON "people"("tenantId", "branchCode", "cpfDigits");
CREATE TABLE "new_school_years" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_school_years" ("canceledAt", "canceledBy", "createdAt", "createdBy", "endDate", "id", "isActive", "startDate", "tenantId", "updatedAt", "updatedBy", "year") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "endDate", "id", "isActive", "startDate", "tenantId", "updatedAt", "updatedBy", "year" FROM "school_years";
DROP TABLE "school_years";
ALTER TABLE "new_school_years" RENAME TO "school_years";
CREATE UNIQUE INDEX "school_years_tenantId_branchCode_year_key" ON "school_years"("tenantId", "branchCode", "year");
CREATE TABLE "new_classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_classes" ("canceledAt", "canceledBy", "createdAt", "createdBy", "defaultMonthlyFee", "gradeLevel", "id", "name", "shift", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "defaultMonthlyFee", "gradeLevel", "id", "name", "shift", "tenantId", "updatedAt", "updatedBy" FROM "classes";
DROP TABLE "classes";
ALTER TABLE "new_classes" RENAME TO "classes";
CREATE INDEX "classes_tenantId_idx" ON "classes"("tenantId");
CREATE TABLE "new_series" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_series" ("canceledAt", "canceledBy", "code", "createdAt", "createdBy", "id", "name", "sortOrder", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "code", "createdAt", "createdBy", "id", "name", "sortOrder", "tenantId", "updatedAt", "updatedBy" FROM "series";
DROP TABLE "series";
ALTER TABLE "new_series" RENAME TO "series";
CREATE INDEX "series_tenantId_idx" ON "series"("tenantId");
CREATE TABLE "new_series_classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_series_classes" ("canceledAt", "canceledBy", "classId", "createdAt", "createdBy", "id", "seriesId", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "classId", "createdAt", "createdBy", "id", "seriesId", "tenantId", "updatedAt", "updatedBy" FROM "series_classes";
DROP TABLE "series_classes";
ALTER TABLE "new_series_classes" RENAME TO "series_classes";
CREATE INDEX "series_classes_tenantId_idx" ON "series_classes"("tenantId");
CREATE INDEX "series_classes_seriesId_idx" ON "series_classes"("seriesId");
CREATE INDEX "series_classes_classId_idx" ON "series_classes"("classId");
CREATE UNIQUE INDEX "series_classes_seriesId_classId_key" ON "series_classes"("seriesId", "classId");
CREATE TABLE "new_guardians" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_guardians" ("accessProfile", "birthDate", "canceledAt", "canceledBy", "cellphone1", "cellphone2", "city", "cnpj", "complement", "corporateName", "cpf", "createdAt", "createdBy", "email", "id", "name", "neighborhood", "nickname", "number", "password", "permissions", "personId", "phone", "resetPasswordExpires", "resetPasswordToken", "rg", "state", "street", "tenantId", "updatedAt", "updatedBy", "whatsapp", "zipCode") SELECT "accessProfile", "birthDate", "canceledAt", "canceledBy", "cellphone1", "cellphone2", "city", "cnpj", "complement", "corporateName", "cpf", "createdAt", "createdBy", "email", "id", "name", "neighborhood", "nickname", "number", "password", "permissions", "personId", "phone", "resetPasswordExpires", "resetPasswordToken", "rg", "state", "street", "tenantId", "updatedAt", "updatedBy", "whatsapp", "zipCode" FROM "guardians";
DROP TABLE "guardians";
ALTER TABLE "new_guardians" RENAME TO "guardians";
CREATE INDEX "guardians_tenantId_idx" ON "guardians"("tenantId");
CREATE INDEX "guardians_personId_idx" ON "guardians"("personId");
CREATE TABLE "new_students" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_students" ("accessProfile", "billingGuardianId", "billingPayerType", "birthDate", "canceledAt", "canceledBy", "cellphone1", "cellphone2", "city", "cnpj", "complement", "corporateName", "cpf", "createdAt", "createdBy", "email", "id", "monthlyFee", "name", "neighborhood", "nickname", "notes", "number", "password", "permissions", "personId", "phone", "photoUrl", "resetPasswordExpires", "resetPasswordToken", "rg", "state", "street", "tenantId", "updatedAt", "updatedBy", "whatsapp", "zipCode") SELECT "accessProfile", "billingGuardianId", "billingPayerType", "birthDate", "canceledAt", "canceledBy", "cellphone1", "cellphone2", "city", "cnpj", "complement", "corporateName", "cpf", "createdAt", "createdBy", "email", "id", "monthlyFee", "name", "neighborhood", "nickname", "notes", "number", "password", "permissions", "personId", "phone", "photoUrl", "resetPasswordExpires", "resetPasswordToken", "rg", "state", "street", "tenantId", "updatedAt", "updatedBy", "whatsapp", "zipCode" FROM "students";
DROP TABLE "students";
ALTER TABLE "new_students" RENAME TO "students";
CREATE INDEX "students_tenantId_idx" ON "students"("tenantId");
CREATE INDEX "students_personId_idx" ON "students"("personId");
CREATE INDEX "students_billingGuardianId_idx" ON "students"("billingGuardianId");
CREATE TABLE "new_guardian_students" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_guardian_students" ("canceledAt", "canceledBy", "createdAt", "createdBy", "guardianId", "id", "kinship", "kinshipDescription", "studentId", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "guardianId", "id", "kinship", "kinshipDescription", "studentId", "tenantId", "updatedAt", "updatedBy" FROM "guardian_students";
DROP TABLE "guardian_students";
ALTER TABLE "new_guardian_students" RENAME TO "guardian_students";
CREATE INDEX "guardian_students_tenantId_idx" ON "guardian_students"("tenantId");
CREATE UNIQUE INDEX "guardian_students_studentId_guardianId_key" ON "guardian_students"("studentId", "guardianId");
CREATE TABLE "new_enrollments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_enrollments" ("canceledAt", "canceledBy", "classId", "createdAt", "createdBy", "id", "schoolYearId", "seriesClassId", "status", "studentId", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "classId", "createdAt", "createdBy", "id", "schoolYearId", "seriesClassId", "status", "studentId", "tenantId", "updatedAt", "updatedBy" FROM "enrollments";
DROP TABLE "enrollments";
ALTER TABLE "new_enrollments" RENAME TO "enrollments";
CREATE INDEX "enrollments_tenantId_idx" ON "enrollments"("tenantId");
CREATE INDEX "enrollments_schoolYearId_idx" ON "enrollments"("schoolYearId");
CREATE INDEX "enrollments_seriesClassId_idx" ON "enrollments"("seriesClassId");
CREATE UNIQUE INDEX "enrollments_studentId_schoolYearId_key" ON "enrollments"("studentId", "schoolYearId");
CREATE TABLE "new_teachers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_teachers" ("accessProfile", "birthDate", "canceledAt", "canceledBy", "cellphone1", "cellphone2", "city", "cnpj", "complement", "corporateName", "cpf", "createdAt", "createdBy", "email", "id", "name", "neighborhood", "nickname", "number", "password", "permissions", "personId", "phone", "resetPasswordExpires", "resetPasswordToken", "rg", "state", "street", "tenantId", "updatedAt", "updatedBy", "whatsapp", "zipCode") SELECT "accessProfile", "birthDate", "canceledAt", "canceledBy", "cellphone1", "cellphone2", "city", "cnpj", "complement", "corporateName", "cpf", "createdAt", "createdBy", "email", "id", "name", "neighborhood", "nickname", "number", "password", "permissions", "personId", "phone", "resetPasswordExpires", "resetPasswordToken", "rg", "state", "street", "tenantId", "updatedAt", "updatedBy", "whatsapp", "zipCode" FROM "teachers";
DROP TABLE "teachers";
ALTER TABLE "new_teachers" RENAME TO "teachers";
CREATE INDEX "teachers_tenantId_idx" ON "teachers"("tenantId");
CREATE INDEX "teachers_personId_idx" ON "teachers"("personId");
CREATE TABLE "new_subjects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_subjects" ("canceledAt", "canceledBy", "createdAt", "createdBy", "id", "name", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "id", "name", "tenantId", "updatedAt", "updatedBy" FROM "subjects";
DROP TABLE "subjects";
ALTER TABLE "new_subjects" RENAME TO "subjects";
CREATE INDEX "subjects_tenantId_idx" ON "subjects"("tenantId");
CREATE TABLE "new_teacher_subjects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_teacher_subjects" ("canceledAt", "canceledBy", "createdAt", "createdBy", "hourlyRate", "id", "subjectId", "teacherId", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "hourlyRate", "id", "subjectId", "teacherId", "tenantId", "updatedAt", "updatedBy" FROM "teacher_subjects";
DROP TABLE "teacher_subjects";
ALTER TABLE "new_teacher_subjects" RENAME TO "teacher_subjects";
CREATE INDEX "teacher_subjects_tenantId_idx" ON "teacher_subjects"("tenantId");
CREATE UNIQUE INDEX "teacher_subjects_teacherId_subjectId_key" ON "teacher_subjects"("teacherId", "subjectId");
CREATE TABLE "new_teacher_subject_rate_histories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_teacher_subject_rate_histories" ("canceledAt", "canceledBy", "createdAt", "createdBy", "effectiveFrom", "effectiveTo", "hourlyRate", "id", "teacherSubjectId", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "effectiveFrom", "effectiveTo", "hourlyRate", "id", "teacherSubjectId", "tenantId", "updatedAt", "updatedBy" FROM "teacher_subject_rate_histories";
DROP TABLE "teacher_subject_rate_histories";
ALTER TABLE "new_teacher_subject_rate_histories" RENAME TO "teacher_subject_rate_histories";
CREATE INDEX "teacher_subject_rate_histories_tenantId_idx" ON "teacher_subject_rate_histories"("tenantId");
CREATE INDEX "teacher_subject_rate_histories_teacherSubjectId_idx" ON "teacher_subject_rate_histories"("teacherSubjectId");
CREATE INDEX "teacher_subject_rate_histories_effectiveFrom_idx" ON "teacher_subject_rate_histories"("effectiveFrom");
CREATE TABLE "new_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_schedules" ("canceledAt", "canceledBy", "createdAt", "createdBy", "endTime", "id", "lessonNumber", "period", "startTime", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "endTime", "id", "lessonNumber", "period", "startTime", "tenantId", "updatedAt", "updatedBy" FROM "schedules";
DROP TABLE "schedules";
ALTER TABLE "new_schedules" RENAME TO "schedules";
CREATE INDEX "schedules_tenantId_idx" ON "schedules"("tenantId");
CREATE UNIQUE INDEX "schedules_tenantId_branchCode_period_lessonNumber_key" ON "schedules"("tenantId", "branchCode", "period", "lessonNumber");
CREATE TABLE "new_class_schedule_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_class_schedule_items" ("canceledAt", "canceledBy", "createdAt", "createdBy", "dayOfWeek", "endTime", "id", "schoolYearId", "seriesClassId", "startTime", "teacherSubjectId", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "dayOfWeek", "endTime", "id", "schoolYearId", "seriesClassId", "startTime", "teacherSubjectId", "tenantId", "updatedAt", "updatedBy" FROM "class_schedule_items";
DROP TABLE "class_schedule_items";
ALTER TABLE "new_class_schedule_items" RENAME TO "class_schedule_items";
CREATE INDEX "class_schedule_items_tenantId_idx" ON "class_schedule_items"("tenantId");
CREATE INDEX "class_schedule_items_schoolYearId_idx" ON "class_schedule_items"("schoolYearId");
CREATE INDEX "class_schedule_items_seriesClassId_idx" ON "class_schedule_items"("seriesClassId");
CREATE INDEX "class_schedule_items_teacherSubjectId_idx" ON "class_schedule_items"("teacherSubjectId");
CREATE UNIQUE INDEX "class_schedule_items_tenantId_branchCode_schoolYearId_seriesClassId_teacherSubjectId_dayOfWeek_startTime_endTime_key" ON "class_schedule_items"("tenantId", "branchCode", "schoolYearId", "seriesClassId", "teacherSubjectId", "dayOfWeek", "startTime", "endTime");
CREATE TABLE "new_lesson_calendars" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_lesson_calendars" ("canceledAt", "canceledBy", "createdAt", "createdBy", "id", "lastWeeklySyncAt", "schoolYearId", "seriesClassId", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "id", "lastWeeklySyncAt", "schoolYearId", "seriesClassId", "tenantId", "updatedAt", "updatedBy" FROM "lesson_calendars";
DROP TABLE "lesson_calendars";
ALTER TABLE "new_lesson_calendars" RENAME TO "lesson_calendars";
CREATE INDEX "lesson_calendars_tenantId_idx" ON "lesson_calendars"("tenantId");
CREATE INDEX "lesson_calendars_schoolYearId_idx" ON "lesson_calendars"("schoolYearId");
CREATE INDEX "lesson_calendars_seriesClassId_idx" ON "lesson_calendars"("seriesClassId");
CREATE TABLE "new_lesson_calendar_periods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_lesson_calendar_periods" ("canceledAt", "canceledBy", "createdAt", "createdBy", "endDate", "id", "lessonCalendarId", "periodType", "sortOrder", "startDate", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "endDate", "id", "lessonCalendarId", "periodType", "sortOrder", "startDate", "tenantId", "updatedAt", "updatedBy" FROM "lesson_calendar_periods";
DROP TABLE "lesson_calendar_periods";
ALTER TABLE "new_lesson_calendar_periods" RENAME TO "lesson_calendar_periods";
CREATE INDEX "lesson_calendar_periods_tenantId_idx" ON "lesson_calendar_periods"("tenantId");
CREATE INDEX "lesson_calendar_periods_lessonCalendarId_idx" ON "lesson_calendar_periods"("lessonCalendarId");
CREATE TABLE "new_lesson_calendar_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_lesson_calendar_items" ("canceledAt", "canceledBy", "classScheduleItemId", "createdAt", "createdBy", "dayOfWeek", "endTime", "hourlyRate", "id", "lessonCalendarId", "lessonDate", "schoolYearId", "seriesClassId", "startTime", "teacherSubjectId", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "classScheduleItemId", "createdAt", "createdBy", "dayOfWeek", "endTime", "hourlyRate", "id", "lessonCalendarId", "lessonDate", "schoolYearId", "seriesClassId", "startTime", "teacherSubjectId", "tenantId", "updatedAt", "updatedBy" FROM "lesson_calendar_items";
DROP TABLE "lesson_calendar_items";
ALTER TABLE "new_lesson_calendar_items" RENAME TO "lesson_calendar_items";
CREATE INDEX "lesson_calendar_items_tenantId_idx" ON "lesson_calendar_items"("tenantId");
CREATE INDEX "lesson_calendar_items_lessonCalendarId_idx" ON "lesson_calendar_items"("lessonCalendarId");
CREATE INDEX "lesson_calendar_items_schoolYearId_idx" ON "lesson_calendar_items"("schoolYearId");
CREATE INDEX "lesson_calendar_items_seriesClassId_idx" ON "lesson_calendar_items"("seriesClassId");
CREATE INDEX "lesson_calendar_items_teacherSubjectId_idx" ON "lesson_calendar_items"("teacherSubjectId");
CREATE INDEX "lesson_calendar_items_classScheduleItemId_idx" ON "lesson_calendar_items"("classScheduleItemId");
CREATE TABLE "new_lesson_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_lesson_events" ("canceledAt", "canceledBy", "classNameSnapshot", "createdAt", "createdBy", "description", "eventDate", "eventType", "id", "lastNotifiedAt", "lessonCalendarItemId", "notifyByEmail", "notifyGuardians", "notifyStudents", "schoolYearId", "seriesClassId", "seriesNameSnapshot", "shiftSnapshot", "subjectNameSnapshot", "teacherId", "teacherSubjectId", "tenantId", "title", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "classNameSnapshot", "createdAt", "createdBy", "description", "eventDate", "eventType", "id", "lastNotifiedAt", "lessonCalendarItemId", "notifyByEmail", "notifyGuardians", "notifyStudents", "schoolYearId", "seriesClassId", "seriesNameSnapshot", "shiftSnapshot", "subjectNameSnapshot", "teacherId", "teacherSubjectId", "tenantId", "title", "updatedAt", "updatedBy" FROM "lesson_events";
DROP TABLE "lesson_events";
ALTER TABLE "new_lesson_events" RENAME TO "lesson_events";
CREATE INDEX "lesson_events_tenantId_idx" ON "lesson_events"("tenantId");
CREATE INDEX "lesson_events_lessonCalendarItemId_idx" ON "lesson_events"("lessonCalendarItemId");
CREATE INDEX "lesson_events_teacherId_idx" ON "lesson_events"("teacherId");
CREATE INDEX "lesson_events_eventDate_idx" ON "lesson_events"("eventDate");
CREATE INDEX "lesson_events_schoolYearId_seriesClassId_idx" ON "lesson_events"("schoolYearId", "seriesClassId");
CREATE TABLE "new_lesson_assessments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_lesson_assessments" ("assessmentType", "canceledAt", "canceledBy", "createdAt", "createdBy", "description", "id", "lastNotifiedAt", "lessonCalendarItemId", "lessonEventId", "maxScore", "notifyByEmail", "notifyGuardians", "notifyStudents", "teacherId", "tenantId", "title", "updatedAt", "updatedBy") SELECT "assessmentType", "canceledAt", "canceledBy", "createdAt", "createdBy", "description", "id", "lastNotifiedAt", "lessonCalendarItemId", "lessonEventId", "maxScore", "notifyByEmail", "notifyGuardians", "notifyStudents", "teacherId", "tenantId", "title", "updatedAt", "updatedBy" FROM "lesson_assessments";
DROP TABLE "lesson_assessments";
ALTER TABLE "new_lesson_assessments" RENAME TO "lesson_assessments";
CREATE UNIQUE INDEX "lesson_assessments_lessonEventId_key" ON "lesson_assessments"("lessonEventId");
CREATE INDEX "lesson_assessments_tenantId_idx" ON "lesson_assessments"("tenantId");
CREATE INDEX "lesson_assessments_lessonCalendarItemId_idx" ON "lesson_assessments"("lessonCalendarItemId");
CREATE INDEX "lesson_assessments_teacherId_idx" ON "lesson_assessments"("teacherId");
CREATE TABLE "new_lesson_assessment_grades" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_lesson_assessment_grades" ("canceledAt", "canceledBy", "createdAt", "createdBy", "id", "lessonAssessmentId", "releasedAt", "remarks", "score", "studentId", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "id", "lessonAssessmentId", "releasedAt", "remarks", "score", "studentId", "tenantId", "updatedAt", "updatedBy" FROM "lesson_assessment_grades";
DROP TABLE "lesson_assessment_grades";
ALTER TABLE "new_lesson_assessment_grades" RENAME TO "lesson_assessment_grades";
CREATE INDEX "lesson_assessment_grades_tenantId_idx" ON "lesson_assessment_grades"("tenantId");
CREATE INDEX "lesson_assessment_grades_lessonAssessmentId_idx" ON "lesson_assessment_grades"("lessonAssessmentId");
CREATE INDEX "lesson_assessment_grades_studentId_idx" ON "lesson_assessment_grades"("studentId");
CREATE UNIQUE INDEX "lesson_assessment_grades_lessonAssessmentId_studentId_key" ON "lesson_assessment_grades"("lessonAssessmentId", "studentId");
CREATE TABLE "new_lesson_attendances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_lesson_attendances" ("canceledAt", "canceledBy", "createdAt", "createdBy", "id", "lessonCalendarItemId", "notes", "recordedAt", "status", "studentId", "teacherId", "tenantId", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "id", "lessonCalendarItemId", "notes", "recordedAt", "status", "studentId", "teacherId", "tenantId", "updatedAt", "updatedBy" FROM "lesson_attendances";
DROP TABLE "lesson_attendances";
ALTER TABLE "new_lesson_attendances" RENAME TO "lesson_attendances";
CREATE INDEX "lesson_attendances_tenantId_idx" ON "lesson_attendances"("tenantId");
CREATE INDEX "lesson_attendances_lessonCalendarItemId_idx" ON "lesson_attendances"("lessonCalendarItemId");
CREATE INDEX "lesson_attendances_studentId_idx" ON "lesson_attendances"("studentId");
CREATE INDEX "lesson_attendances_teacherId_idx" ON "lesson_attendances"("teacherId");
CREATE UNIQUE INDEX "lesson_attendances_lessonCalendarItemId_studentId_key" ON "lesson_attendances"("lessonCalendarItemId", "studentId");
CREATE TABLE "new_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
INSERT INTO "new_notifications" ("actionUrl", "canceledAt", "canceledBy", "category", "createdAt", "createdBy", "emailedAt", "id", "message", "metadata", "readAt", "readBy", "recipientId", "recipientType", "sourceId", "sourceType", "tenantId", "title", "updatedAt", "updatedBy") SELECT "actionUrl", "canceledAt", "canceledBy", "category", "createdAt", "createdBy", "emailedAt", "id", "message", "metadata", "readAt", "readBy", "recipientId", "recipientType", "sourceId", "sourceType", "tenantId", "title", "updatedAt", "updatedBy" FROM "notifications";
DROP TABLE "notifications";
ALTER TABLE "new_notifications" RENAME TO "notifications";
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");
CREATE INDEX "notifications_recipientType_recipientId_idx" ON "notifications"("recipientType", "recipientId");
CREATE INDEX "notifications_readAt_idx" ON "notifications"("readAt");
CREATE TABLE "new_communication_campaigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
INSERT INTO "new_communication_campaigns" ("canceledAt", "canceledBy", "createdAt", "createdBy", "emailCount", "id", "internalCount", "lastSentAt", "message", "recipientGroups", "sendEmail", "sendInternal", "senderId", "senderName", "senderRole", "senderType", "tenantId", "title", "totalRecipients", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "emailCount", "id", "internalCount", "lastSentAt", "message", "recipientGroups", "sendEmail", "sendInternal", "senderId", "senderName", "senderRole", "senderType", "tenantId", "title", "totalRecipients", "updatedAt", "updatedBy" FROM "communication_campaigns";
DROP TABLE "communication_campaigns";
ALTER TABLE "new_communication_campaigns" RENAME TO "communication_campaigns";
CREATE INDEX "communication_campaigns_tenantId_idx" ON "communication_campaigns"("tenantId");
CREATE INDEX "communication_campaigns_senderType_senderId_idx" ON "communication_campaigns"("senderType", "senderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "tenant_branches_tenantId_isActive_name_idx" ON "tenant_branches"("tenantId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_branches_tenantId_branchCode_key" ON "tenant_branches"("tenantId", "branchCode");

