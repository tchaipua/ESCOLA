import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import {
  NOTIFICATION_EVENT_DEFINITIONS,
  NOTIFICATION_EVENT_TYPES,
} from "../notification-event-definitions";
import { UpdateNotificationPreferencesDto } from "../dto/update-notification-preferences.dto";

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()?.userId;
  }

  listEventDefinitions() {
    return NOTIFICATION_EVENT_DEFINITIONS;
  }

  async getPersonPreferences(personId: string) {
    const tenantId = this.tenantId();
    const person = await this.prisma.person.findFirst({
      where: { id: personId, tenantId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException("Pessoa não encontrada.");

    const saved = await this.prisma.notificationPreference.findMany({
      where: { tenantId, personId, canceledAt: null },
    });
    const savedByType = new Map(saved.map((item) => [item.eventType, item]));

    return NOTIFICATION_EVENT_DEFINITIONS.map((definition) => {
      const item = savedByType.get(definition.eventType);
      return {
        eventType: definition.eventType,
        label: definition.label,
        group: definition.group,
        enabled: item?.enabled ?? false,
        sendInternal: item?.enabled ? item.sendInternal : false,
        sendEmail: item?.enabled ? item.sendEmail : false,
        sendTelegram: item?.enabled ? item.sendTelegram : false,
      };
    });
  }

  async updatePersonPreferences(
    personId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const tenantId = this.tenantId();
    const person = await this.prisma.person.findFirst({
      where: { id: personId, tenantId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException("Pessoa não encontrada.");

    const uniqueItems = new Map(
      dto.preferences.map((item) => [item.eventType, item]),
    );
    const invalidType = Array.from(uniqueItems.keys()).find(
      (eventType) => !(NOTIFICATION_EVENT_TYPES as readonly string[]).includes(eventType),
    );
    if (invalidType) throw new NotFoundException("Tipo de notificação inválido.");

    await this.prisma.$transaction(
      Array.from(uniqueItems.values()).map((item) =>
        this.prisma.notificationPreference.upsert({
          where: {
            tenantId_personId_eventType: {
              tenantId,
              personId,
              eventType: item.eventType,
            },
          },
          create: {
            tenantId,
            personId,
            eventType: item.eventType,
            enabled: item.enabled,
            sendInternal: item.enabled ? item.sendInternal : false,
            sendEmail: item.enabled ? item.sendEmail : false,
            sendTelegram: item.enabled ? item.sendTelegram : false,
            createdBy: this.userId(),
            updatedBy: this.userId(),
          },
          update: {
            enabled: item.enabled,
            sendInternal: item.enabled ? item.sendInternal : false,
            sendEmail: item.enabled ? item.sendEmail : false,
            sendTelegram: item.enabled ? item.sendTelegram : false,
            canceledAt: null,
            canceledBy: null,
            updatedBy: this.userId(),
          },
        }),
      ),
    );

    return {
      message: "Preferências de eventos atualizadas com sucesso.",
      personId,
      preferences: await this.getPersonPreferences(personId),
    };
  }
}
