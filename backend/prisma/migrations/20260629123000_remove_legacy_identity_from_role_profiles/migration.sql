-- Remove remaining identity/credential duplicates from role tables.
ALTER TABLE "teachers" DROP COLUMN "name";
ALTER TABLE "teachers" DROP COLUMN "password";
ALTER TABLE "teachers" DROP COLUMN "resetPasswordToken";
ALTER TABLE "teachers" DROP COLUMN "resetPasswordExpires";

ALTER TABLE "students" DROP COLUMN "name";
ALTER TABLE "students" DROP COLUMN "password";
ALTER TABLE "students" DROP COLUMN "resetPasswordToken";
ALTER TABLE "students" DROP COLUMN "resetPasswordExpires";

ALTER TABLE "guardians" DROP COLUMN "name";
ALTER TABLE "guardians" DROP COLUMN "password";
ALTER TABLE "guardians" DROP COLUMN "resetPasswordToken";
ALTER TABLE "guardians" DROP COLUMN "resetPasswordExpires";
