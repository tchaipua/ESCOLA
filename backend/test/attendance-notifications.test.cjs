const assert = require("node:assert/strict");

const {
  NotificationsService,
} = require("../dist/src/modules/notifications/application/services/notifications.service.js");
const {
  tenantContext,
} = require("../dist/src/common/tenant/tenant.context.js");

async function testDispatchAttendanceNotificationsTargetsOnlyLinkedRecipients() {
  const createManyCalls = [];

  const prisma = {
    enrollment: {
      findMany: async () => [
        {
          student: {
            id: "student-1",
            name: "ALUNO UM",
            email: "aluno1@escola.com",
            guardians: [
              {
                guardian: {
                  id: "guardian-1",
                  name: "RESPONSAVEL UM",
                  email: "resp1@escola.com",
                },
              },
              {
                guardian: {
                  id: "guardian-2",
                  name: "RESPONSAVEL DOIS",
                  email: "resp2@escola.com",
                },
              },
            ],
          },
        },
      ],
    },
    notification: {
      createMany: async (args) => {
        createManyCalls.push(args);
        return { count: args.data.length };
      },
    },
  };

  const service = new NotificationsService(prisma);

  const result = await tenantContext.run(
    {
      tenantId: "tenant-1",
      userId: "teacher-1",
      role: "PROFESSOR",
    },
    async () =>
      service.dispatchAttendanceNotifications({
        attendance: {
          lessonCalendarItemId: "lesson-1",
          notifyStudents: true,
          notifyGuardians: true,
        },
        lessonItem: {
          id: "lesson-1",
          lessonDate: new Date("2026-03-24T00:00:00.000Z"),
          startTime: "07:00",
          endTime: "07:50",
          schoolYearId: "year-1",
          seriesClassId: "series-class-1",
          teacherSubject: {
            subject: { name: "MATEMATICA" },
            teacher: { name: "PROFESSOR TESTE" },
          },
          seriesClass: {
            series: { name: "1 ANO" },
            class: { name: "A" },
          },
        },
        attendanceStudents: [
          {
            studentId: "student-1",
            status: "FALTOU",
            notes: "SEM JUSTIFICATIVA",
          },
        ],
      }),
  );

  assert.equal(result.notificationsCreated, 3);
  assert.equal(createManyCalls.length, 1);

  const notifications = createManyCalls[0].data;
  assert.deepEqual(
    notifications.map((item) => [item.recipientType, item.recipientId]),
    [
      ["STUDENT", "student-1"],
      ["GUARDIAN", "guardian-1"],
      ["GUARDIAN", "guardian-2"],
    ],
  );

  notifications.forEach((item) => {
    const metadata = JSON.parse(item.metadata);
    assert.equal(item.tenantId, "tenant-1");
    assert.equal(item.sourceType, "LESSON_ATTENDANCE");
    assert.equal(item.sourceId, "lesson-1");
    assert.equal(metadata.studentId, "student-1");
    assert.equal(metadata.seriesClassId, "series-class-1");
    assert.equal(metadata.status, "FALTOU");
  });
}

async function testDispatchAttendanceNotificationsSkipsUnrelatedStudents() {
  const createManyCalls = [];

  const prisma = {
    enrollment: {
      findMany: async () => [
        {
          student: {
            id: "student-2",
            name: "ALUNO DOIS",
            email: "aluno2@escola.com",
            guardians: [
              {
                guardian: {
                  id: "guardian-9",
                  name: "RESPONSAVEL NOVE",
                  email: "resp9@escola.com",
                },
              },
            ],
          },
        },
      ],
    },
    notification: {
      createMany: async (args) => {
        createManyCalls.push(args);
        return { count: args.data.length };
      },
    },
  };

  const service = new NotificationsService(prisma);

  const result = await tenantContext.run(
    {
      tenantId: "tenant-1",
      userId: "teacher-1",
      role: "PROFESSOR",
    },
    async () =>
      service.dispatchAttendanceNotifications({
        attendance: {
          lessonCalendarItemId: "lesson-1",
          notifyStudents: true,
          notifyGuardians: true,
        },
        lessonItem: {
          id: "lesson-1",
          lessonDate: new Date("2026-03-24T00:00:00.000Z"),
          startTime: "07:00",
          endTime: "07:50",
          schoolYearId: "year-1",
          seriesClassId: "series-class-1",
          teacherSubject: {
            subject: { name: "MATEMATICA" },
            teacher: { name: "PROFESSOR TESTE" },
          },
          seriesClass: {
            series: { name: "1 ANO" },
            class: { name: "A" },
          },
        },
        attendanceStudents: [
          {
            studentId: "student-1",
            status: "PRESENTE",
            notes: null,
          },
        ],
      }),
  );

  assert.equal(result.notificationsCreated, 0);
  assert.equal(createManyCalls.length, 0);
}

async function testDispatchAttendanceNotificationsRespectsSelectedChannels() {
  const createManyCalls = [];

  const prisma = {
    enrollment: {
      findMany: async () => [
        {
          student: {
            id: "student-1",
            name: "ALUNO UM",
            email: "aluno1@escola.com",
            guardians: [
              {
                guardian: {
                  id: "guardian-1",
                  name: "RESPONSAVEL UM",
                  email: "resp1@escola.com",
                },
              },
            ],
          },
        },
      ],
    },
    notification: {
      createMany: async (args) => {
        createManyCalls.push(args);
        return { count: args.data.length };
      },
    },
  };

  const service = new NotificationsService(prisma);

  const result = await tenantContext.run(
    {
      tenantId: "tenant-1",
      userId: "teacher-1",
      role: "PROFESSOR",
    },
    async () =>
      service.dispatchAttendanceNotifications({
        attendance: {
          lessonCalendarItemId: "lesson-1",
          notifyStudents: false,
          notifyGuardians: true,
        },
        lessonItem: {
          id: "lesson-1",
          lessonDate: new Date("2026-03-24T00:00:00.000Z"),
          startTime: "07:00",
          endTime: "07:50",
          schoolYearId: "year-1",
          seriesClassId: "series-class-1",
          teacherSubject: {
            subject: { name: "MATEMATICA" },
            teacher: { name: "PROFESSOR TESTE" },
          },
          seriesClass: {
            series: { name: "1 ANO" },
            class: { name: "A" },
          },
        },
        attendanceStudents: [
          {
            studentId: "student-1",
            status: "PRESENTE",
            notes: null,
          },
        ],
      }),
  );

  assert.equal(result.notificationsCreated, 1);
  assert.equal(createManyCalls.length, 1);
  assert.deepEqual(
    createManyCalls[0].data.map((item) => [item.recipientType, item.recipientId]),
    [["GUARDIAN", "guardian-1"]],
  );
}

async function testDispatchAttendanceNotificationsKeepsEachStudentSeparatedForSharedGuardian() {
  const createManyCalls = [];

  const prisma = {
    enrollment: {
      findMany: async () => [
        {
          student: {
            id: "student-1",
            name: "ALUNO UM",
            email: "aluno1@escola.com",
            guardians: [
              {
                guardian: {
                  id: "guardian-shared",
                  name: "RESPONSAVEL COMPARTILHADO",
                  email: "shared@escola.com",
                },
              },
            ],
          },
        },
        {
          student: {
            id: "student-2",
            name: "ALUNO DOIS",
            email: "aluno2@escola.com",
            guardians: [
              {
                guardian: {
                  id: "guardian-shared",
                  name: "RESPONSAVEL COMPARTILHADO",
                  email: "shared@escola.com",
                },
              },
              {
                guardian: {
                  id: "guardian-2",
                  name: "RESPONSAVEL DOIS",
                  email: "resp2@escola.com",
                },
              },
            ],
          },
        },
      ],
    },
    notification: {
      createMany: async (args) => {
        createManyCalls.push(args);
        return { count: args.data.length };
      },
    },
  };

  const service = new NotificationsService(prisma);

  const result = await tenantContext.run(
    {
      tenantId: "tenant-1",
      userId: "teacher-1",
      role: "PROFESSOR",
    },
    async () =>
      service.dispatchAttendanceNotifications({
        attendance: {
          lessonCalendarItemId: "lesson-1",
          notifyStudents: false,
          notifyGuardians: true,
        },
        lessonItem: {
          id: "lesson-1",
          lessonDate: new Date("2026-03-24T00:00:00.000Z"),
          startTime: "07:00",
          endTime: "07:50",
          schoolYearId: "year-1",
          seriesClassId: "series-class-1",
          teacherSubject: {
            subject: { name: "MATEMATICA" },
            teacher: { name: "PROFESSOR TESTE" },
          },
          seriesClass: {
            series: { name: "1 ANO" },
            class: { name: "A" },
          },
        },
        attendanceStudents: [
          {
            studentId: "student-1",
            status: "FALTOU",
            notes: "SEM JUSTIFICATIVA",
          },
          {
            studentId: "student-2",
            status: "PRESENTE",
            notes: null,
          },
        ],
      }),
  );

  assert.equal(result.notificationsCreated, 3);
  assert.equal(createManyCalls.length, 1);

  const notifications = createManyCalls[0].data;
  const sharedGuardianNotifications = notifications.filter(
    (item) => item.recipientType === "GUARDIAN" && item.recipientId === "guardian-shared",
  );

  assert.equal(sharedGuardianNotifications.length, 2);

  const sharedStudentIds = sharedGuardianNotifications
    .map((item) => JSON.parse(item.metadata).studentId)
    .sort();

  assert.deepEqual(sharedStudentIds, ["student-1", "student-2"]);
}

async function main() {
  const tests = [
    {
      name: "dispatchAttendanceNotifications notifies only linked student and guardians",
      fn: testDispatchAttendanceNotificationsTargetsOnlyLinkedRecipients,
    },
    {
      name: "dispatchAttendanceNotifications skips unrelated students",
      fn: testDispatchAttendanceNotificationsSkipsUnrelatedStudents,
    },
    {
      name: "dispatchAttendanceNotifications respects selected channels",
      fn: testDispatchAttendanceNotificationsRespectsSelectedChannels,
    },
    {
      name: "dispatchAttendanceNotifications keeps each student separated for shared guardian",
      fn: testDispatchAttendanceNotificationsKeepsEachStudentSeparatedForSharedGuardian,
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
