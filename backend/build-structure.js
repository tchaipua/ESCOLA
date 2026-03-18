const fs = require('fs');
const path = require('path');

const filesToCreate = {
    "prisma/schema.prisma": `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Tenant {
  id        String    @id @default(uuid())
  name      String
  document  String?   @unique
  isActive  Boolean   @default(true)
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  users       User[]
  schoolYears SchoolYear[]
  classes     Class[]
  students    Student[]
  enrollments Enrollment[]

  @@map("tenants")
}

model User {
  id        String    @id @default(uuid())
  tenantId  String
  name      String
  email     String
  password  String
  role      String    @default("USER")
  isActive  Boolean   @default(true)
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  tenant    Tenant    @relation(fields: [tenantId], references: [id])

  @@unique([email, tenantId])
  @@map("users")
}

model SchoolYear {
  id        String    @id @default(uuid())
  tenantId  String
  year      Int
  isActive  Boolean   @default(false)
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  tenant    Tenant    @relation(fields: [tenantId], references: [id])
  classes     Class[]
  enrollments Enrollment[]

  @@unique([tenantId, year])
  @@map("school_years")
}

model Class {
  id           String    @id @default(uuid())
  tenantId     String
  schoolYearId String
  name         String
  shift        String
  isActive     Boolean   @default(true)
  deletedAt    DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  tenant       Tenant      @relation(fields: [tenantId], references: [id])
  schoolYear   SchoolYear  @relation(fields: [schoolYearId], references: [id])
  enrollments  Enrollment[]

  @@map("classes")
}

model Student {
  id        String    @id @default(uuid())
  tenantId  String
  name      String
  document  String
  birthDate DateTime
  isActive  Boolean   @default(true)
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  tenant      Tenant       @relation(fields: [tenantId], references: [id])
  enrollments Enrollment[]

  @@unique([document, tenantId])
  @@map("students")
}

model Enrollment {
  id           String    @id @default(uuid())
  tenantId     String
  studentId    String
  classId      String
  schoolYearId String
  status       String    @default("ACTIVE")
  deletedAt    DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  tenant       Tenant      @relation(fields: [tenantId], references: [id])
  student      Student     @relation(fields: [studentId], references: [id])
  class        Class       @relation(fields: [classId], references: [id])
  schoolYear   SchoolYear  @relation(fields: [schoolYearId], references: [id])

  @@unique([studentId, schoolYearId])
  @@map("enrollments")
}
`,
    ".env": `
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/escola_db?schema=public"
JWT_SECRET="super-secret-escolar-key-2026"
PORT=3000
`,
    "src/main.ts": `
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('School SaaS API')
    .setDescription('Multi-tenant Backend for School Management')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
`,
    "src/app.module.ts": `
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    // Outros módulos (Tenants, SchoolYears, etc) podem ser adicionados aqui...
  ],
})
export class AppModule {}
`,
    "src/prisma/prisma.service.ts": `
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
`,
    "src/prisma/prisma.module.ts": `
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
`,
    "src/common/decorators/current-user.decorator.ts": `
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface ICurrentUser {
  id: string;
  tenantId: string;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ICurrentUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
`,
    "src/common/guards/jwt-auth.guard.ts": `
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
`,
    "src/modules/auth/auth.module.ts": `
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './application/services/auth.service';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { JwtStrategy } from './application/strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-escolar-key-2026',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
`,
    "src/modules/auth/application/services/auth.service.ts": `
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: any) {
    const user = await this.prisma.user.findFirst({
      where: { email: loginDto.email, deletedAt: null },
      include: { tenant: true }
    });

    if (!user || !user.isActive || !user.tenant.isActive) {
      throw new UnauthorizedException('Invalid credentials or inactive access');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { email: user.email, sub: user.id, tenantId: user.tenantId, role: user.role };
    
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      }
    };
  }
}
`,
    "src/modules/auth/application/strategies/jwt.strategy.ts": `
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'super-secret-escolar-key-2026',
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });

    if (!user || !user.isActive || !user.tenant.isActive || user.deletedAt) {
      throw new UnauthorizedException('Access denied or tenant inactivated');
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };
  }
}
`,
    "src/modules/auth/infrastructure/controllers/auth.controller.ts": `
import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from '../../application/services/auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: any) {
    return this.authService.login(loginDto);
  }
}
`,
    "src/modules/users/users.module.ts": `
import { Module } from '@nestjs/common';
import { UsersController } from './infrastructure/controllers/users.controller';
import { UsersService } from './application/services/users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
`,
    "src/modules/users/application/services/users.service.ts": `
import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: any, tenantId: string) {
    const existingUser = await this.prisma.user.findFirst({
      where: { email: createUserDto.email, tenantId, deletedAt: null },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use for this tenant');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    return this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        tenantId, // Force the authenticated user's tenantId
      },
    });
  }

  async findAllByTenantId(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      }
    });
  }
}
`,
    "src/modules/users/infrastructure/controllers/users.controller.ts": `
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from '../../application/services/users.service';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '../../../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() createUserDto: any, @CurrentUser() user: ICurrentUser) {
    // Inject the mandatory tenantId
    return this.usersService.create(createUserDto, user.tenantId);
  }

  @Get()
  async findAll(@CurrentUser() user: ICurrentUser) {
    // All queries must filter by tenantId!
    return this.usersService.findAllByTenantId(user.tenantId);
  }
}
`
};

for (const [relativePath, content] of Object.entries(filesToCreate)) {
    const fullPath = path.join(__dirname, relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content.trim() + '\\n', 'utf8');
}

// Generate empty module folders as requested
const otherModules = ['tenants', 'school-years', 'classes', 'students', 'enrollments'];
for (const m of otherModules) {
    const modDir = path.join(__dirname, 'src/modules', m);
    const dirs = [
        path.join(modDir, 'domain/entities'),
        path.join(modDir, 'application/dto'),
        path.join(modDir, 'application/services'),
        path.join(modDir, 'infrastructure/controllers'),
    ];
    dirs.forEach(d => {
        if (!fs.existsSync(d)) {
            fs.mkdirSync(d, { recursive: true });
        }
    });
}

console.log('Project structure generated successfully!');
