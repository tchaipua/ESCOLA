CREATE TABLE "notification_conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "notificationId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "closedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,
    CONSTRAINT "notification_conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_conversations_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "notification_conversation_participants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "participantType" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "participantName" TEXT NOT NULL,
    "historyVisibleFrom" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedBy" TEXT,
    "lastReadAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,
    CONSTRAINT "notification_conversation_participants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "notification_conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "notification_conversation_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,
    CONSTRAINT "notification_conversation_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "notification_conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "notification_conversation_audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "notification_conversation_audit_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_conversation_audit_events_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "notification_conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_conversations_tenantId_notificationId_ownerType_ownerId_key" ON "notification_conversations"("tenantId", "notificationId", "ownerType", "ownerId");
CREATE INDEX "notification_conversations_tenantId_branchCode_canceledAt_idx" ON "notification_conversations"("tenantId", "branchCode", "canceledAt");
CREATE INDEX "notification_conversations_notificationId_canceledAt_idx" ON "notification_conversations"("notificationId", "canceledAt");
CREATE UNIQUE INDEX "notification_conversation_participants_conversationId_participantType_participantId_key" ON "notification_conversation_participants"("conversationId", "participantType", "participantId");
CREATE INDEX "notification_conversation_participants_tenantId_participantType_participantId_canceledAt_idx" ON "notification_conversation_participants"("tenantId", "participantType", "participantId", "canceledAt");
CREATE INDEX "notification_conversation_messages_tenantId_conversationId_createdAt_idx" ON "notification_conversation_messages"("tenantId", "conversationId", "createdAt");
CREATE INDEX "notification_conversation_audit_events_tenantId_conversationId_createdAt_idx" ON "notification_conversation_audit_events"("tenantId", "conversationId", "createdAt");

