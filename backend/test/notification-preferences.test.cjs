const assert = require("node:assert/strict");

const {
  NotificationPreferencesService,
} = require("../dist/src/modules/notification-preferences/application/services/notification-preferences.service.js");
const {
  NOTIFICATION_EVENT_DEFINITIONS,
} = require("../dist/src/modules/notification-preferences/application/notification-event-definitions.js");
const {
  NotificationsService,
} = require("../dist/src/modules/notifications/application/services/notifications.service.js");
const { tenantContext } = require("../dist/src/common/tenant/tenant.context.js");

async function testPreferencesAreTenantScopedAndHaveIndividualEvents() {
  const upserts = [];
  const prisma = {
    person: {
      findFirst: async ({ where }) =>
        where.tenantId === "tenant-1" && where.id === "person-1"
          ? { id: "person-1" }
          : null,
    },
    notificationPreference: {
      findMany: async () => [],
      upsert: async (args) => {
        upserts.push(args);
        return args.create;
      },
    },
    $transaction: async (operations) => Promise.all(operations),
  };
  const service = new NotificationPreferencesService(prisma);

  await tenantContext.run(
    { tenantId: "tenant-1", userId: "admin-1", role: "ADMIN", branchCode: 1 },
    async () => {
      const defaults = await service.getPersonPreferences("person-1");
      assert.equal(defaults.length, NOTIFICATION_EVENT_DEFINITIONS.length);
      assert.equal(defaults[0].enabled, false);
      assert.equal(defaults[0].sendInternal, false);

      await service.updatePersonPreferences("person-1", {
        preferences: [
          {
            eventType: "TEACHER_INACTIVATED",
            enabled: true,
            sendInternal: true,
            sendEmail: false,
            sendTelegram: true,
          },
        ],
      });

      await service.updatePersonPreferences("person-1", {
        preferences: [
          {
            eventType: "STUDENT_INACTIVATED",
            enabled: false,
            sendInternal: true,
            sendEmail: true,
            sendTelegram: true,
          },
        ],
      });
    },
  );

  assert.equal(upserts.length, 2);
  assert.equal(upserts[0].create.tenantId, "tenant-1");
  assert.equal(upserts[0].create.personId, "person-1");
  assert.equal(upserts[1].create.sendInternal, false);
  assert.equal(upserts[1].create.sendEmail, false);
  assert.equal(upserts[1].create.sendTelegram, false);

  await assert.rejects(
    tenantContext.run(
      { tenantId: "tenant-2", userId: "admin-2", role: "ADMIN", branchCode: 1 },
      () => service.getPersonPreferences("person-1"),
    ),
  );
}

async function testConfiguredEventCreatesOnlyActiveTenantRecipients() {
  const createManyCalls = [];
  const prisma = {
    notificationPreference: {
      findMany: async ({ where }) => {
        assert.equal(where.tenantId, "tenant-1");
        assert.equal(where.eventType, "TEACHER_INACTIVATED");
        return [
          {
            enabled: true,
            sendInternal: true,
            sendEmail: false,
            sendTelegram: false,
            person: {
              id: "person-1",
              name: "GESTOR",
              email: null,
              telegramChatId: null,
              telegramOptInAt: null,
              telegramOptOutAt: null,
              users: [{ id: "user-1" }],
              teachers: [],
              students: [],
              guardians: [],
            },
          },
        ];
      },
    },
    notification: {
      createMany: async (args) => {
        createManyCalls.push(args);
        return { count: args.data.length };
      },
    },
  };
  const service = new NotificationsService(prisma, undefined);

  await tenantContext.run(
    { tenantId: "tenant-1", userId: "teacher-1", role: "PROFESSOR", branchCode: 1 },
    () =>
      service.dispatchConfiguredEventNotification({
        eventType: "TEACHER_INACTIVATED",
        title: "PROFESSOR INATIVADO",
        message: "O PROFESSOR FOI INATIVADO.",
        sourceType: "TEACHER_STATUS",
        sourceId: "teacher-2",
      }),
  );

  assert.equal(createManyCalls.length, 1);
  assert.equal(createManyCalls[0].data.length, 1);
  assert.equal(createManyCalls[0].data[0].tenantId, "tenant-1");
  assert.equal(createManyCalls[0].data[0].recipientId, "user-1");
}

Promise.all([
  testPreferencesAreTenantScopedAndHaveIndividualEvents(),
  testConfiguredEventCreatesOnlyActiveTenantRecipients(),
])
  .then(() => {
    console.log("PASS notification preferences keep individual settings and tenant isolation");
    console.log("PASS configured events create notifications only for configured recipients");
    console.log("TOTAL 2 TESTS PASSING");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
