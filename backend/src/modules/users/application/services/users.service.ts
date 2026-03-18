import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../../../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: any, tenantId: string) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    return {
      ...createUserDto,
      password: hashedPassword,
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
