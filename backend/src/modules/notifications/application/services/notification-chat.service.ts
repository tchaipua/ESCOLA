import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import { PrismaService } from "../../../../prisma/prisma.service";

type ParticipantType = "USER" | "TEACHER" | "STUDENT" | "GUARDIAN";

type Account = {
  participantType: ParticipantType;
  participantId: string;
  name: string;
};

@Injectable()
export class NotificationChatService {
  constructor(private readonly prisma: PrismaService) {}

  private normalize(value: unknown) {
    return String(value ?? "").trim().toUpperCase();
  }

  private currentAccount(currentUser: ICurrentUser): Account {
    const participantType: ParticipantType =
      currentUser.role === "PROFESSOR"
        ? "TEACHER"
        : currentUser.role === "ALUNO"
          ? "STUDENT"
          : currentUser.role === "RESPONSAVEL"
            ? "GUARDIAN"
            : "USER";
    return {
      participantType,
      participantId: currentUser.userId,
      name: this.normalize(currentUser.name || currentUser.email || "USUÁRIO"),
    };
  }

  private async findAccessibleConversation(
    notificationId: string,
    currentUser: ICurrentUser,
  ) {
    const account = this.currentAccount(currentUser);
    return this.prisma.notificationConversation.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        notificationId,
        canceledAt: null,
        participants: {
          some: {
            participantType: account.participantType,
            participantId: account.participantId,
            canceledAt: null,
          },
        },
      },
      include: {
        notification: true,
        participants: {
          where: { canceledAt: null },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
  }

  private async findDirectNotification(
    notificationId: string,
    currentUser: ICurrentUser,
  ) {
    const account = this.currentAccount(currentUser);
    return this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        tenantId: currentUser.tenantId,
        recipientType: account.participantType,
        recipientId: account.participantId,
        canceledAt: null,
      },
    });
  }

  private async requireAccess(notificationId: string, currentUser: ICurrentUser) {
    const conversation = await this.findAccessibleConversation(
      notificationId,
      currentUser,
    );
    if (conversation) {
      return { notification: conversation.notification, conversation };
    }
    const notification = await this.findDirectNotification(
      notificationId,
      currentUser,
    );
    if (!notification) {
      throw new NotFoundException("Notificação não encontrada.");
    }
    return { notification, conversation: null };
  }

  private async resolveAccount(
    tenantId: string,
    type: ParticipantType,
    id: string,
    branchCode?: number,
  ): Promise<Account | null> {
    const branchScope = Number.isInteger(branchCode)
      ? {
          OR: [
            { branchCode },
            { branchAccesses: { some: { branchCode, canceledAt: null } } },
          ],
        }
      : {};
    if (type === "USER") {
      const user = await this.prisma.user.findFirst({
        where: { id, tenantId, canceledAt: null, ...branchScope },
        include: { person: true },
      });
      return user
        ? { participantType: type, participantId: id, name: this.normalize(user.person?.name || user.name) }
        : null;
    }
    const delegate =
      type === "TEACHER"
        ? this.prisma.teacher
        : type === "STUDENT"
          ? this.prisma.student
          : this.prisma.guardian;
    const account = await (delegate as any).findFirst({
      where: { id, tenantId, canceledAt: null, ...branchScope },
      include: { person: true },
    });
    return account
      ? {
          participantType: type,
          participantId: id,
          name: this.normalize(account.person?.name || "USUÁRIO"),
        }
      : null;
  }

  private async resolveInitialCounterpart(
    notification: { tenantId: string; branchCode: number; createdBy: string | null },
    current: Account,
  ) {
    if (notification.createdBy) {
      for (const type of ["USER", "TEACHER", "STUDENT", "GUARDIAN"] as const) {
        if (
          type === current.participantType &&
          notification.createdBy === current.participantId
        ) {
          continue;
        }
        const account = await this.resolveAccount(
          notification.tenantId,
          type,
          notification.createdBy,
          notification.branchCode,
        );
        if (account) return account;
      }
    }

    const fallback = await this.prisma.user.findFirst({
      where: {
        tenantId: notification.tenantId,
        canceledAt: null,
        id: { not: current.participantId },
        role: { in: ["ADMIN", "SECRETARIA"] },
        OR: [
          { branchCode: notification.branchCode },
          {
            branchAccesses: {
              some: {
                branchCode: notification.branchCode,
                canceledAt: null,
              },
            },
          },
        ],
      },
      include: { person: true },
      orderBy: { createdAt: "asc" },
    });
    return fallback
      ? {
          participantType: "USER" as const,
          participantId: fallback.id,
          name: this.normalize(fallback.person?.name || fallback.name),
        }
      : null;
  }

  private async ensureConversation(
    notificationId: string,
    currentUser: ICurrentUser,
  ) {
    const access = await this.requireAccess(notificationId, currentUser);
    if (access.conversation) return access.conversation;

    const current = this.currentAccount(currentUser);
    const counterpart = await this.resolveInitialCounterpart(
      access.notification,
      current,
    );
    if (!counterpart) {
      throw new BadRequestException(
        "Não foi possível identificar outro usuário para iniciar o chat.",
      );
    }
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const conversation = await tx.notificationConversation.create({
          data: {
            tenantId: currentUser.tenantId,
            branchCode: access.notification.branchCode,
            notificationId,
            ownerType: current.participantType,
            ownerId: current.participantId,
            createdBy: currentUser.userId,
            updatedBy: currentUser.userId,
          },
        });
        await tx.notificationConversationParticipant.createMany({
          data: [current, counterpart].map((participant) => ({
            tenantId: currentUser.tenantId,
            conversationId: conversation.id,
            participantType: participant.participantType,
            participantId: participant.participantId,
            participantName: participant.name,
            historyVisibleFrom: now,
            joinedAt: now,
            invitedBy: currentUser.userId,
            canInvite: true,
            lastReadAt:
              participant.participantType === current.participantType &&
              participant.participantId === current.participantId
                ? now
                : null,
            createdBy: currentUser.userId,
            updatedBy: currentUser.userId,
          })),
        });
        await tx.notificationConversationAuditEvent.create({
          data: {
            tenantId: currentUser.tenantId,
            conversationId: conversation.id,
            action: "CONVERSATION_CREATED",
            actorType: current.participantType,
            actorId: current.participantId,
            metadata: JSON.stringify({ notificationId, counterpart }),
            createdBy: currentUser.userId,
          },
        });
        return tx.notificationConversation.findUniqueOrThrow({
          where: { id: conversation.id },
          include: {
            notification: true,
            participants: { where: { canceledAt: null }, orderBy: { joinedAt: "asc" } },
          },
        });
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        const existing = await this.findAccessibleConversation(
          notificationId,
          currentUser,
        );
        if (existing) return existing;
      }
      throw error;
    }
  }

  async getChat(notificationId: string, currentUser: ICurrentUser) {
    const access = await this.requireAccess(notificationId, currentUser);
    if (!access.conversation) {
      return {
        notification: access.notification,
        conversation: null,
        participants: [],
        messages: [],
      };
    }
    const current = this.currentAccount(currentUser);
    const participant = access.conversation.participants.find(
      (item) =>
        item.participantType === current.participantType &&
        item.participantId === current.participantId,
    );
    if (!participant) throw new ForbiddenException("Acesso ao chat negado.");
    const messages = await this.prisma.notificationConversationMessage.findMany({
      where: {
        tenantId: currentUser.tenantId,
        conversationId: access.conversation.id,
        canceledAt: null,
        createdAt: { gte: participant.historyVisibleFrom },
      },
      orderBy: { createdAt: "asc" },
    });
    return {
      notification: access.notification,
      conversation: {
        id: access.conversation.id,
        closedAt: access.conversation.closedAt,
        createdAt: access.conversation.createdAt,
      },
      participants: access.conversation.participants,
      messages,
    };
  }

  async sendMessage(
    notificationId: string,
    currentUser: ICurrentUser,
    rawMessage: string,
  ) {
    const content = this.normalize(rawMessage);
    if (!content || content.length > 2000) {
      throw new BadRequestException("A mensagem deve possuir de 1 a 2000 caracteres.");
    }
    const conversation = await this.ensureConversation(
      notificationId,
      currentUser,
    );
    if (conversation.closedAt) {
      throw new ConflictException("Este chat está encerrado.");
    }
    const current = this.currentAccount(currentUser);
    const participant = conversation.participants.find(
      (item) =>
        item.participantType === current.participantType &&
        item.participantId === current.participantId,
    );
    if (!participant) throw new ForbiddenException("Acesso ao chat negado.");
    const now = new Date();
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.notificationConversationMessage.create({
        data: {
          tenantId: currentUser.tenantId,
          conversationId: conversation.id,
          senderType: current.participantType,
          senderId: current.participantId,
          senderName: current.name,
          content,
          createdBy: currentUser.userId,
          updatedBy: currentUser.userId,
        },
      });
      await tx.notificationConversationParticipant.update({
        where: { id: participant.id },
        data: { lastReadAt: now, updatedBy: currentUser.userId },
      });
      await tx.notificationConversation.update({
        where: { id: conversation.id },
        data: { updatedBy: currentUser.userId },
      });
      await tx.notificationConversationAuditEvent.create({
        data: {
          tenantId: currentUser.tenantId,
          conversationId: conversation.id,
          action: "MESSAGE_SENT",
          actorType: current.participantType,
          actorId: current.participantId,
          metadata: JSON.stringify({ messageId: created.id }),
          createdBy: currentUser.userId,
        },
      });
      return created;
    });
    return { conversationId: conversation.id, message };
  }

  private candidateWhere(branchCode: number) {
    return {
      canceledAt: null,
      OR: [
        { branchCode },
        { branchAccesses: { some: { branchCode, canceledAt: null } } },
      ],
    };
  }

  async searchCandidates(
    notificationId: string,
    currentUser: ICurrentUser,
    rawSearch: string,
  ) {
    const search = this.normalize(rawSearch);
    if (search.length < 2) return [];
    const access = await this.requireAccess(notificationId, currentUser);
    if (!access.conversation) return [];
    const existing = new Set(
      access.conversation.participants.map(
        (item) => `${item.participantType}:${item.participantId}`,
      ),
    );
    const common = {
      tenantId: currentUser.tenantId,
      canceledAt: null,
    };
    const branchScope = this.candidateWhere(access.notification.branchCode).OR;
    const [users, teachers, students, guardians] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          ...common,
          AND: [
            { OR: branchScope },
            { OR: [{ name: { contains: search } }, { person: { name: { contains: search } } }] },
          ],
        },
        include: { person: true },
        take: 20,
      }),
      this.prisma.teacher.findMany({
        where: { ...common, AND: [{ OR: branchScope }, { person: { name: { contains: search } } }] },
        include: { person: true },
        take: 20,
      }),
      this.prisma.student.findMany({
        where: { ...common, AND: [{ OR: branchScope }, { person: { name: { contains: search } } }] },
        include: { person: true },
        take: 20,
      }),
      this.prisma.guardian.findMany({
        where: { ...common, AND: [{ OR: branchScope }, { person: { name: { contains: search } } }] },
        include: { person: true },
        take: 20,
      }),
    ]);
    return [
      ...users.map((item) => ({ participantType: "USER" as const, participantId: item.id, name: this.normalize(item.person?.name || item.name), label: "USUÁRIO" })),
      ...teachers.map((item) => ({ participantType: "TEACHER" as const, participantId: item.id, name: this.normalize(item.person?.name), label: "PROFESSOR" })),
      ...students.map((item) => ({ participantType: "STUDENT" as const, participantId: item.id, name: this.normalize(item.person?.name), label: "ALUNO" })),
      ...guardians.map((item) => ({ participantType: "GUARDIAN" as const, participantId: item.id, name: this.normalize(item.person?.name), label: "RESPONSÁVEL" })),
    ]
      .filter((item) => item.name && !existing.has(`${item.participantType}:${item.participantId}`))
      .slice(0, 20);
  }

  async addParticipant(
    notificationId: string,
    currentUser: ICurrentUser,
    participantType: ParticipantType,
    participantId: string,
  ) {
    const access = await this.requireAccess(notificationId, currentUser);
    if (!access.conversation) {
      throw new BadRequestException("Envie a primeira mensagem antes de adicionar participantes.");
    }
    const current = this.currentAccount(currentUser);
    const inviter = access.conversation.participants.find(
      (item) =>
        item.participantType === current.participantType &&
        item.participantId === current.participantId,
    );
    if (!inviter?.canInvite) {
      throw new ForbiddenException(
        "Somente os dois participantes iniciais podem adicionar pessoas ao chat.",
      );
    }
    const account = await this.resolveAccount(
      currentUser.tenantId,
      participantType,
      participantId,
      access.notification.branchCode,
    );
    if (!account) throw new NotFoundException("Participante não encontrado.");
    const now = new Date();
    try {
      const participant = await this.prisma.$transaction(async (tx) => {
        const created = await tx.notificationConversationParticipant.create({
          data: {
            tenantId: currentUser.tenantId,
            conversationId: access.conversation!.id,
            participantType: account.participantType,
            participantId: account.participantId,
            participantName: account.name,
            historyVisibleFrom: now,
            joinedAt: now,
            invitedBy: currentUser.userId,
            canInvite: false,
            createdBy: currentUser.userId,
            updatedBy: currentUser.userId,
          },
        });
        await tx.notificationConversationAuditEvent.create({
          data: {
            tenantId: currentUser.tenantId,
            conversationId: access.conversation!.id,
            action: "PARTICIPANT_ADDED",
            actorType: current.participantType,
            actorId: current.participantId,
            metadata: JSON.stringify(account),
            createdBy: currentUser.userId,
          },
        });
        return created;
      });
      return participant;
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException("Este participante já faz parte do chat.");
      }
      throw error;
    }
  }

  async markRead(notificationId: string, currentUser: ICurrentUser) {
    const access = await this.requireAccess(notificationId, currentUser);
    if (!access.conversation) return { updated: false };
    const current = this.currentAccount(currentUser);
    const participant = access.conversation.participants.find(
      (item) =>
        item.participantType === current.participantType &&
        item.participantId === current.participantId,
    );
    if (!participant) throw new ForbiddenException("Acesso ao chat negado.");
    const latestMessage = await this.prisma.notificationConversationMessage.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        conversationId: access.conversation.id,
        canceledAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (
      !latestMessage ||
      (participant.lastReadAt && participant.lastReadAt >= latestMessage.createdAt)
    ) {
      return { updated: false, readAt: participant.lastReadAt };
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.notificationConversationParticipant.update({
        where: { id: participant.id },
        data: { lastReadAt: now, updatedBy: currentUser.userId },
      }),
      this.prisma.notificationConversationAuditEvent.create({
        data: {
          tenantId: currentUser.tenantId,
          conversationId: access.conversation.id,
          action: "CHAT_READ",
          actorType: current.participantType,
          actorId: current.participantId,
          createdBy: currentUser.userId,
        },
      }),
    ]);
    return { updated: true, readAt: now };
  }
}
