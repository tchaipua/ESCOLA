import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const UI_TEACHER_LOGIN = "QA.UI.PROF.CENTRAL.20260804";
const UI_STUDENT_LOGIN = "QA.UI.ALUNO.CENTRAL.20260804";
const PREVIOUS_QA_TEACHER_LOGIN = "QA.PROF.CENTRAL.20260804";
const PREVIOUS_QA_STUDENT_LOGIN = "QA.ALUNO.CENTRAL.20260804";

type ReferenceRole = {
  id: string;
  personId: string | null;
  branchCode: number | bigint;
  updatedAt: string | Date;
  updatedBy: string | null;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  assert(!Number.isNaN(date.getTime()), "O banco de referência contém uma data inválida.");
  return date;
}

async function main() {
  assert(
    process.env.NODE_ENV !== "production",
    "Este reparo controlado não pode ser executado em produção.",
  );
  assert(
    process.env.QA_APPLY_PERSON_LINK_REPAIR === "YES",
    "Confirmação explícita do reparo controlado não fornecida.",
  );
  const referenceUrl = String(process.env.QA_SCHOOL_REFERENCE_DATABASE_URL || "");
  assert(referenceUrl.startsWith("file:"), "Banco SQLite de referência não fornecido.");

  const current = new PrismaClient();
  const reference = new PrismaClient({
    datasources: { db: { url: referenceUrl } },
  });

  try {
    const [uiTeacher, uiStudent, referenceTeachers, referenceStudents] =
      await Promise.all([
        current.teacher.findFirst({ where: { accessUsername: UI_TEACHER_LOGIN } }),
        current.student.findFirst({ where: { accessUsername: UI_STUDENT_LOGIN } }),
        reference.$queryRawUnsafe<ReferenceRole[]>(
          "SELECT id, personId, branchCode, updatedAt, updatedBy FROM teachers",
        ),
        reference.$queryRawUnsafe<ReferenceRole[]>(
          "SELECT id, personId, branchCode, updatedAt, updatedBy FROM students",
        ),
      ]);
    assert(uiTeacher?.personId, "Professor de QA não possui o vínculo que identifica o incidente.");
    assert(uiStudent?.personId, "Aluno de QA não possui o vínculo que identifica o incidente.");

    const [affectedTeachers, affectedStudents] = await Promise.all([
      current.teacher.findMany({
        where: { personId: uiTeacher.personId },
        select: { id: true, accessUsername: true },
      }),
      current.student.findMany({
        where: { personId: uiStudent.personId },
        select: { id: true, accessUsername: true },
      }),
    ]);
    const teacherReference = new Map(referenceTeachers.map((row) => [row.id, row]));
    const studentReference = new Map(referenceStudents.map((row) => [row.id, row]));
    const teachersWithoutReference = affectedTeachers.filter(
      (row) => !teacherReference.has(row.id),
    );
    const studentsWithoutReference = affectedStudents.filter(
      (row) => !studentReference.has(row.id),
    );
    assert(
      teachersWithoutReference.length === 2 &&
        teachersWithoutReference.some((row) => row.accessUsername === UI_TEACHER_LOGIN) &&
        teachersWithoutReference.some(
          (row) => row.accessUsername === PREVIOUS_QA_TEACHER_LOGIN,
        ),
      "O conjunto de professores sem referência não corresponde somente às massas de QA.",
    );
    assert(
      studentsWithoutReference.length === 2 &&
        studentsWithoutReference.some((row) => row.accessUsername === UI_STUDENT_LOGIN) &&
        studentsWithoutReference.some(
          (row) => row.accessUsername === PREVIOUS_QA_STUDENT_LOGIN,
        ),
      "O conjunto de alunos sem referência não corresponde somente às massas de QA.",
    );

    const referencedPersonIds = Array.from(
      new Set(
        [
          ...affectedTeachers
            .map((row) => teacherReference.get(row.id)?.personId)
            .filter((id): id is string => Boolean(id)),
          ...affectedStudents
            .map((row) => studentReference.get(row.id)?.personId)
            .filter((id): id is string => Boolean(id)),
        ],
      ),
    );
    const existingReferencedPeople = await current.person.count({
      where: { id: { in: referencedPersonIds } },
    });
    assert(
      existingReferencedPeople === referencedPersonIds.length,
      "Nem todas as pessoas originais do banco de referência existem no banco atual.",
    );

    const operations = [
      ...affectedTeachers
        .filter((row) => row.id !== uiTeacher.id)
        .map((row) => {
          const original = teacherReference.get(row.id);
          if (!original) {
            assert(
              row.accessUsername === PREVIOUS_QA_TEACHER_LOGIN,
              "Professor sem referência não autorizado para reparo.",
            );
            return current.teacher.update({
              where: { id: row.id },
              data: { personId: null },
            });
          }
          return current.teacher.update({
            where: { id: row.id },
            data: {
              personId: original.personId,
              branchCode: Number(original.branchCode),
              updatedAt: asDate(original.updatedAt),
              updatedBy: original.updatedBy,
            },
          });
        }),
      ...affectedStudents
        .filter((row) => row.id !== uiStudent.id)
        .map((row) => {
          const original = studentReference.get(row.id);
          if (!original) {
            assert(
              row.accessUsername === PREVIOUS_QA_STUDENT_LOGIN,
              "Aluno sem referência não autorizado para reparo.",
            );
            return current.student.update({
              where: { id: row.id },
              data: { personId: null },
            });
          }
          return current.student.update({
            where: { id: row.id },
            data: {
              personId: original.personId,
              branchCode: Number(original.branchCode),
              updatedAt: asDate(original.updatedAt),
              updatedBy: original.updatedBy,
            },
          });
        }),
    ];

    await current.$transaction(operations);

    const [remainingTeacherLinks, remainingStudentLinks] = await Promise.all([
      current.teacher.findMany({
        where: { personId: uiTeacher.personId },
        select: { id: true, accessUsername: true },
      }),
      current.student.findMany({
        where: { personId: uiStudent.personId },
        select: { id: true, accessUsername: true },
      }),
    ]);
    assert(
      remainingTeacherLinks.length === 1 && remainingTeacherLinks[0].id === uiTeacher.id,
      "O vínculo exclusivo do professor de QA não foi restaurado.",
    );
    assert(
      remainingStudentLinks.length === 1 && remainingStudentLinks[0].id === uiStudent.id,
      "O vínculo exclusivo do aluno de QA não foi restaurado.",
    );

    console.log(JSON.stringify({
      status: "SUCCESS",
      repaired: {
        teachersFromReference: affectedTeachers.length - teachersWithoutReference.length,
        studentsFromReference: affectedStudents.length - studentsWithoutReference.length,
        previousQaLinksCleared: 2,
      },
      preserved: {
        uiTeacherId: uiTeacher.id,
        uiStudentId: uiStudent.id,
      },
      reference: "LOCAL_SQLITE_BACKUP",
    }, null, 2));
  } finally {
    await Promise.all([current.$disconnect(), reference.$disconnect()]);
  }
}

void main().catch((error) => {
  console.error(
    "[QA REPARO PESSOAS] Falha:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
