import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { ICurrentUser } from "../../../../common/decorators/current-user.decorator";

@Injectable()
export class UserPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(currentUser: ICurrentUser, key: string) {
    const normalizedKey = key.trim();

    const preference = await this.prisma.userPreference.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        userId: currentUser.userId,
        preferenceKey: normalizedKey,
        canceledAt: null,
      },
    });

    if (!preference) {
      throw new NotFoundException("Preferência não encontrada para este usuário.");
    }

    return {
      key: preference.preferenceKey,
      value: preference.preferenceValue,
      updatedAt: preference.updatedAt,
    };
  }

  async upsert(currentUser: ICurrentUser, key: string, value: string) {
    const normalizedKey = key.trim();

    const existing = await this.prisma.userPreference.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        userId: currentUser.userId,
        preferenceKey: normalizedKey,
      },
      select: { id: true, canceledAt: true },
    });

    if (existing) {
      return this.prisma.userPreference.update({
        where: { id: existing.id },
        data: {
          preferenceValue: value,
          updatedBy: currentUser.userId,
          canceledAt: null,
          canceledBy: null,
        },
      });
    }

    return this.prisma.userPreference.create({
      data: {
        tenantId: currentUser.tenantId,
        userId: currentUser.userId,
        preferenceKey: normalizedKey,
        preferenceValue: value,
        createdBy: currentUser.userId,
      },
    });
  }
}
