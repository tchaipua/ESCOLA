const assert = require("node:assert/strict");
const { ForbiddenException } = require("@nestjs/common");
const {
  NotificationChatService,
} = require("../dist/src/modules/notifications/application/services/notification-chat.service.js");

const notification = {
  id: "NOTIFICATION-1",
  tenantId: "SCHOOL-1",
  branchCode: 3,
  recipientType: "STUDENT",
  recipientId: "STUDENT-1",
  canceledAt: null,
  createdBy: "USER-SENDER",
};

const currentUser = {
  userId: "STUDENT-1",
  tenantId: "SCHOOL-1",
  branchCode: 3,
  role: "ALUNO",
  permissions: [],
  name: "ALUNO TESTE",
};

async function main() {
  const participantRows = [];
  const auditActions = [];
  const prisma = {
    notificationConversation: {
      findFirst: async () => null,
    },
    notification: {
      findFirst: async (args) => {
        assert.equal(args.where.tenantId, "SCHOOL-1");
        assert.equal(args.where.recipientType, "STUDENT");
        assert.equal(args.where.recipientId, "STUDENT-1");
        return notification;
      },
    },
    user: {
      findFirst: async (args) =>
        args.where.id === "USER-SENDER"
          ? { id: "USER-SENDER", name: "SECRETARIA", person: null }
          : null,
    },
    teacher: { findFirst: async () => null },
    student: { findFirst: async () => null },
    guardian: { findFirst: async () => null },
    $transaction: async (callback) => {
      const tx = {
        notificationConversation: {
          create: async ({ data }) => ({ id: "CONVERSATION-1", ...data }),
          findUniqueOrThrow: async () => ({
            id: "CONVERSATION-1",
            notification,
            closedAt: null,
            participants: participantRows.map((item, index) => ({
              id: `PARTICIPANT-${index}`,
              ...item,
            })),
          }),
        },
        notificationConversationParticipant: {
          createMany: async ({ data }) => {
            participantRows.push(...data);
            return { count: data.length };
          },
        },
        notificationConversationAuditEvent: {
          create: async ({ data }) => {
            auditActions.push(data.action);
            return { id: "AUDIT-1" };
          },
        },
      };
      return callback(tx);
    },
  };

  const service = new NotificationChatService(prisma);
  const conversation = await service.ensureConversation(
    notification.id,
    currentUser,
  );
  assert.equal(conversation.id, "CONVERSATION-1");
  assert.deepEqual(
    participantRows.map((item) => [item.participantType, item.participantId]),
    [
      ["STUDENT", "STUDENT-1"],
      ["USER", "USER-SENDER"],
    ],
  );
  assert.ok(participantRows.every((item) => item.historyVisibleFrom instanceof Date));
  assert.deepEqual(auditActions, ["CONVERSATION_CREATED"]);

  const historyStart = new Date("2026-08-14T13:00:00.000Z");
  let messageWhere;
  const invitedPrisma = {
    notificationConversation: {
      findFirst: async () => ({
        id: "CONVERSATION-2",
        notification,
        closedAt: null,
        createdAt: new Date(),
        participants: [
          {
            id: "PARTICIPANT-GUARDIAN",
            participantType: "GUARDIAN",
            participantId: "GUARDIAN-1",
            historyVisibleFrom: historyStart,
          },
        ],
      }),
    },
    notificationConversationMessage: {
      findMany: async (args) => {
        messageWhere = args.where;
        return [];
      },
    },
  };
  const invitedService = new NotificationChatService(invitedPrisma);
  await invitedService.getChat(notification.id, {
    ...currentUser,
    userId: "GUARDIAN-1",
    role: "RESPONSAVEL",
  });
  assert.equal(messageWhere.tenantId, "SCHOOL-1");
  assert.equal(messageWhere.createdAt.gte, historyStart);
  await assert.rejects(
    () =>
      invitedService.addParticipant(
        notification.id,
        {
          ...currentUser,
          userId: "GUARDIAN-1",
          role: "RESPONSAVEL",
        },
        "USER",
        "ANOTHER-USER",
      ),
    (error) => error instanceof ForbiddenException,
  );

  console.log(
    "Chat escolar: dupla inicial, auditoria e corte de historico validados.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
