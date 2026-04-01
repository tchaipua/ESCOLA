import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../../../prisma/prisma.service";
import { SharedProfilesService } from "../../../shared-profiles/application/services/shared-profiles.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedProfilesService: SharedProfilesService,
  ) {}

  async create(createUserDto: any, tenantId: string) {
    const normalizedEmail = String(createUserDto.email || "")
      .trim()
      .toUpperCase();
    const normalizedPassword = String(createUserDto.password || "").trim();
    let hashedPassword: string | null = null;

    if (normalizedPassword) {
      hashedPassword = await bcrypt.hash(normalizedPassword, 10);
      await this.sharedProfilesService.updateEmailCredentialPassword(
        normalizedEmail,
        hashedPassword,
      );
    } else if (normalizedEmail) {
      await this.sharedProfilesService.ensureEmailCredential(normalizedEmail);
    }

    return {
      ...createUserDto,
      password: null,
      tenantId,
    };
  }

  async findAllByTenantId(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        updatedAt: true,
        canceledAt: true,
      },
      orderBy: [{ canceledAt: "asc" }, { name: "asc" }],
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      updatedAt: user.updatedAt,
      active: !user.canceledAt,
    }));
  }
}
