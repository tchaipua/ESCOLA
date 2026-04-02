const assert = require("node:assert/strict");

const {
  ClassScheduleItemsService,
} = require("../dist/src/modules/class-schedule-items/application/services/class-schedule-items.service.js");
const {
  tenantContext,
} = require("../dist/src/common/tenant/tenant.context.js");

const TENANT_ID = "tenant-1";
const USER_ID = "user-1";
const SCHOOL_YEAR_ID = "year-1";
const DAY_OF_WEEK = "SEGUNDA";

const schoolYears = [
  {
    id: SCHOOL_YEAR_ID,
    tenantId: TENANT_ID,
    canceledAt: null,
    year: 2026,
  },
];

const seriesClasses = [
  {
    id: "series-class-1",
    tenantId: TENANT_ID,
    canceledAt: null,
    series: { id: "series-1", name: "MATERNAL 1" },
    class: { id: "class-1", name: "TESTE A" },
  },
  {
    id: "series-class-2",
    tenantId: TENANT_ID,
    canceledAt: null,
    series: { id: "series-1", name: "MATERNAL 1" },
    class: { id: "class-2", name: "TESTE B" },
  },
];

const teacherSubjects = [
  {
    id: "teacher-subject-1",
    tenantId: TENANT_ID,
    canceledAt: null,
    teacherId: "teacher-1",
    teacher: { id: "teacher-1", name: "PROFESSOR 1", tenantId: TENANT_ID, canceledAt: null },
    subject: { id: "subject-1", name: "MATEMÁTICA", tenantId: TENANT_ID, canceledAt: null },
  },
  {
    id: "teacher-subject-2",
    tenantId: TENANT_ID,
    canceledAt: null,
    teacherId: "teacher-2",
    teacher: { id: "teacher-2", name: "PROFESSOR 2", tenantId: TENANT_ID, canceledAt: null },
    subject: { id: "subject-2", name: "FILOSOFIA", tenantId: TENANT_ID, canceledAt: null },
  },
  {
    id: "teacher-subject-3",
    tenantId: TENANT_ID,
    canceledAt: null,
    teacherId: "teacher-1",
    teacher: { id: "teacher-1", name: "PROFESSOR 1", tenantId: TENANT_ID, canceledAt: null },
    subject: { id: "subject-3", name: "HISTÓRIA", tenantId: TENANT_ID, canceledAt: null },
  },
];

function enrichItem(item) {
  return {
    ...item,
    schoolYear: schoolYears.find((entry) => entry.id === item.schoolYearId) || null,
    seriesClass: seriesClasses.find((entry) => entry.id === item.seriesClassId) || null,
    teacherSubject: item.teacherSubjectId
      ? teacherSubjects.find((entry) => entry.id === item.teacherSubjectId) || null
      : null,
  };
}

function matchesItem(item, where = {}) {
  if (where.tenantId && item.tenantId !== where.tenantId) return false;
  if (where.id) {
    if (typeof where.id === "string" && item.id !== where.id) return false;
    if (typeof where.id === "object" && where.id.not && item.id === where.id.not) return false;
  }
  if (where.schoolYearId && item.schoolYearId !== where.schoolYearId) return false;
  if (where.seriesClassId && item.seriesClassId !== where.seriesClassId) return false;
  if (where.dayOfWeek && item.dayOfWeek !== where.dayOfWeek) return false;
  if (Object.prototype.hasOwnProperty.call(where, "teacherSubjectId")) {
    if ((where.teacherSubjectId ?? null) !== (item.teacherSubjectId ?? null)) return false;
  }
  if (Object.prototype.hasOwnProperty.call(where, "startTime") && item.startTime !== where.startTime) return false;
  if (Object.prototype.hasOwnProperty.call(where, "endTime") && item.endTime !== where.endTime) return false;
  if (where.canceledAt === null && item.canceledAt !== null) return false;

  if (where.teacherSubject?.is) {
    const teacherSubject = item.teacherSubjectId
      ? teacherSubjects.find((entry) => entry.id === item.teacherSubjectId) || null
      : null;

    if (!teacherSubject) return false;
    if (where.teacherSubject.is.tenantId && teacherSubject.tenantId !== where.teacherSubject.is.tenantId) return false;
    if (where.teacherSubject.is.canceledAt === null && teacherSubject.canceledAt !== null) return false;
    if (where.teacherSubject.is.teacherId && teacherSubject.teacherId !== where.teacherSubject.is.teacherId) return false;
  }

  return true;
}

function createService(initialItems = []) {
  const state = {
    items: initialItems.map((item) => ({
      tenantId: TENANT_ID,
      canceledAt: null,
      canceledBy: null,
      createdBy: USER_ID,
      updatedBy: USER_ID,
      ...item,
    })),
  };

  const prisma = {
    schoolYear: {
      findFirst: async ({ where }) =>
        schoolYears.find(
          (entry) =>
            entry.id === where.id &&
            entry.tenantId === where.tenantId &&
            (where.canceledAt !== null || entry.canceledAt === null),
        ) || null,
    },
    seriesClass: {
      findFirst: async ({ where }) =>
        seriesClasses.find(
          (entry) =>
            entry.id === where.id &&
            entry.tenantId === where.tenantId &&
            (where.canceledAt !== null || entry.canceledAt === null),
        ) || null,
    },
    teacherSubject: {
      findFirst: async ({ where, select }) => {
        const teacherSubject =
          teacherSubjects.find(
            (entry) =>
              entry.id === where.id &&
              entry.tenantId === where.tenantId &&
              (where.canceledAt !== null || entry.canceledAt === null),
          ) || null;

        if (!teacherSubject) {
          return null;
        }

        if (select?.teacherId) {
          return { teacherId: teacherSubject.teacherId };
        }

        return teacherSubject;
      },
    },
    classScheduleItem: {
      findFirst: async ({ where }) => {
        const item = state.items.find((entry) => matchesItem(entry, where)) || null;
        return item ? enrichItem(item) : null;
      },
      findMany: async ({ where }) =>
        state.items
          .filter((entry) => matchesItem(entry, where))
          .map((entry) => enrichItem(entry)),
      create: async ({ data }) => {
        const created = {
          id: `item-${state.items.length + 1}`,
          canceledAt: null,
          canceledBy: null,
          updatedBy: data.createdBy,
          ...data,
        };
        state.items.push(created);
        return enrichItem(created);
      },
      update: async ({ where, data }) => {
        const current = state.items.find((entry) => entry.id === where.id);
        if (!current) {
          throw new Error("item not found");
        }

        Object.assign(current, data);
        return enrichItem(current);
      },
      count: async () => 0,
    },
    $transaction: async (callback) => callback(prisma),
  };

  return {
    service: new ClassScheduleItemsService(prisma),
    state,
  };
}

async function runInTenant(task) {
  return tenantContext.run(
    {
      tenantId: TENANT_ID,
      userId: USER_ID,
      role: "ADMIN",
    },
    task,
  );
}

async function testRejectsOverlappingRangeForSameClass() {
  const { service } = createService([
    {
      id: "item-existing",
      schoolYearId: SCHOOL_YEAR_ID,
      seriesClassId: "series-class-1",
      teacherSubjectId: "teacher-subject-1",
      dayOfWeek: DAY_OF_WEEK,
      startTime: "08:40",
      endTime: "09:20",
    },
  ]);

  await assert.rejects(
    () =>
      runInTenant(() =>
        service.create({
          schoolYearId: SCHOOL_YEAR_ID,
          seriesClassId: "series-class-1",
          teacherSubjectId: "teacher-subject-2",
          dayOfWeek: DAY_OF_WEEK,
          startTime: "09:10",
          endTime: "09:40",
        }),
      ),
    (error) => {
      assert.match(error.message, /turma neste dia/i);
      assert.match(error.message, /08:40 às 09:20/i);
      return true;
    },
  );
}

async function testAllowsBoundaryTouchingForSameClass() {
  const { service } = createService([
    {
      id: "item-existing",
      schoolYearId: SCHOOL_YEAR_ID,
      seriesClassId: "series-class-1",
      teacherSubjectId: "teacher-subject-1",
      dayOfWeek: DAY_OF_WEEK,
      startTime: "08:40",
      endTime: "09:20",
    },
  ]);

  const created = await runInTenant(() =>
    service.create({
      schoolYearId: SCHOOL_YEAR_ID,
      seriesClassId: "series-class-1",
      teacherSubjectId: "teacher-subject-2",
      dayOfWeek: DAY_OF_WEEK,
      startTime: "09:20",
      endTime: "10:00",
    }),
  );

  assert.equal(created.startTime, "09:20");
  assert.equal(created.endTime, "10:00");
}

async function testRejectsTeacherOverlapAcrossDifferentClasses() {
  const { service } = createService([
    {
      id: "item-existing",
      schoolYearId: SCHOOL_YEAR_ID,
      seriesClassId: "series-class-1",
      teacherSubjectId: "teacher-subject-1",
      dayOfWeek: DAY_OF_WEEK,
      startTime: "08:40",
      endTime: "09:20",
    },
  ]);

  await assert.rejects(
    () =>
      runInTenant(() =>
        service.create({
          schoolYearId: SCHOOL_YEAR_ID,
          seriesClassId: "series-class-2",
          teacherSubjectId: "teacher-subject-3",
          dayOfWeek: DAY_OF_WEEK,
          startTime: "09:10",
          endTime: "09:50",
        }),
      ),
    (error) => {
      assert.match(error.message, /professor selecionado/i);
      assert.match(error.message, /matrernal|maternal/i);
      assert.match(error.message, /08:40 às 09:20/i);
      return true;
    },
  );
}

async function testAllowsTeacherBoundaryTouchingAcrossDifferentClasses() {
  const { service } = createService([
    {
      id: "item-existing",
      schoolYearId: SCHOOL_YEAR_ID,
      seriesClassId: "series-class-1",
      teacherSubjectId: "teacher-subject-1",
      dayOfWeek: DAY_OF_WEEK,
      startTime: "08:40",
      endTime: "09:20",
    },
  ]);

  const created = await runInTenant(() =>
    service.create({
      schoolYearId: SCHOOL_YEAR_ID,
      seriesClassId: "series-class-2",
      teacherSubjectId: "teacher-subject-3",
      dayOfWeek: DAY_OF_WEEK,
      startTime: "09:20",
      endTime: "10:00",
    }),
  );

  assert.equal(created.seriesClass?.id, "series-class-2");
  assert.equal(created.startTime, "09:20");
}

async function testActivationRejectsNewOverlap() {
  const { service } = createService([
    {
      id: "item-inactive",
      schoolYearId: SCHOOL_YEAR_ID,
      seriesClassId: "series-class-1",
      teacherSubjectId: "teacher-subject-2",
      dayOfWeek: DAY_OF_WEEK,
      startTime: "08:40",
      endTime: "09:20",
      canceledAt: new Date("2026-04-02T10:00:00.000Z"),
    },
    {
      id: "item-active",
      schoolYearId: SCHOOL_YEAR_ID,
      seriesClassId: "series-class-1",
      teacherSubjectId: "teacher-subject-1",
      dayOfWeek: DAY_OF_WEEK,
      startTime: "09:10",
      endTime: "09:40",
    },
  ]);

  await assert.rejects(
    () => runInTenant(() => service.setActiveStatus("item-inactive", true)),
    (error) => {
      assert.match(error.message, /turma neste dia/i);
      assert.match(error.message, /09:10 às 09:40/i);
      return true;
    },
  );
}

async function main() {
  const tests = [
    {
      name: "rejects overlapping range for the same class",
      fn: testRejectsOverlappingRangeForSameClass,
    },
    {
      name: "allows boundary touching for the same class",
      fn: testAllowsBoundaryTouchingForSameClass,
    },
    {
      name: "rejects teacher overlap across different classes",
      fn: testRejectsTeacherOverlapAcrossDifferentClasses,
    },
    {
      name: "allows teacher boundary touching across different classes",
      fn: testAllowsTeacherBoundaryTouchingAcrossDifferentClasses,
    },
    {
      name: "activation rejects a newly conflicting schedule item",
      fn: testActivationRejectsNewOverlap,
    },
  ];

  for (const currentTest of tests) {
    await currentTest.fn();
    console.log(`PASS ${currentTest.name}`);
  }

  console.log(`TOTAL ${tests.length} TESTS PASSING`);
}

main().catch((error) => {
  console.error("TEST_FAILURE", error);
  process.exitCode = 1;
});
