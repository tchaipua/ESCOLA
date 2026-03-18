import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";

@Injectable()
export class UsersService {
  constructor() {} // Injete o prisma aqui normalmente

  async create(createUserDto: any, tenantId: string) {
    // Exemplo de criação forçando o tenant
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    return {
      ...createUserDto,
      password: hashedPassword,
      tenantId,
    };
  }

  async findAllByTenantId(tenantId: string) {
    // Aqui usar Prisma.User.findMany filtrando por TenantId
    return [{ tenantId, name: "Sample" }];
  }
}
