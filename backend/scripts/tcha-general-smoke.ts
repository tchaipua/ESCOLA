import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { buildMasterPass } from "../src/common/auth/master-auth";
import { createValidationException } from "../src/common/validation/validation-exception.factory";

type Session = {
  token: string;
  user: {
    id: string;
    tenantId: string;
    role: string;
    modelType?: string;
  };
};

type NamedEntity = {
  id: string;
  name: string;
  email?: string | null;
};

type TeacherSubjectAssignment = {
  id: string;
  teacherId: string;
  subjectId: string;
};

type RequestOptions = {
  token?: string;
  headers?: Record<string, string>;
  body?: unknown;
  expectedStatus?: number | number[];
};

type LoginResponse = {
  status: string;
  access_token?: string;
  user?: Session["user"];
  devVerificationLink?: string;
};

const CONFIG = {
  tenant: {
    name: "TCHA",
    document: "TCHA-20260326",
    adminName: "ADMIN TCHA",
    adminEmail: "ADMIN.TCHA@MSINFOR.COM",
    adminPassword: "Admin001",
    email: "CONTATO.TCHA@MSINFOR.COM",
    city: "SAO PAULO",
    state: "SP",
  },
  passwords: {
    teacher: "Prof1234",
    student: "Aluno1234",
    guardian: "Resp1234",
  },
  schoolYear: {
    year: 2026,
    startDate: "2026-03-01",
    endDate: "2026-11-30",
    intervalStart: "2026-07-01",
    intervalEnd: "2026-07-31",
  },
  referenceDate: "2026-03-02",
  weekdays: ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"],
  slots: [
    { startTime: "07:00", endTime: "07:50" },
    { startTime: "07:50", endTime: "08:40" },
    { startTime: "08:40", endTime: "09:30" },
    { startTime: "09:45", endTime: "10:35" },
    { startTime: "10:35", endTime: "11:25" },
  ],
  series: [
    { name: "1 ANO", code: "1ANO", sortOrder: 1 },
    { name: "2 ANO", code: "2ANO", sortOrder: 2 },
    { name: "3 ANO", code: "3ANO", sortOrder: 3 },
  ],
  classes: [
    { name: "TURMA A", shift: "MANHA" },
    { name: "TURMA B", shift: "MANHA" },
    { name: "TURMA C", shift: "MANHA" },
    { name: "TURMA D", shift: "MANHA" },
    { name: "TURMA E", shift: "MANHA" },
  ],
  subjects: [
    "MATEMATICA",
    "PORTUGUES",
    "HISTORIA",
    "GEOGRAFIA",
    "CIENCIAS",
    "INGLES",
    "ARTES",
    "EDUCACAO FISICA",
    "INFORMATICA",
    "REDACAO",
  ],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function isWeekday(value: Date) {
  const day = value.getUTCDay();
  return day >= 1 && day <= 5;
}

function isInsideRange(value: Date, start: Date, end: Date) {
  return value.getTime() >= start.getTime() && value.getTime() <= end.getTime();
}

function countSchoolDays() {
  const schoolStart = toDateOnly(CONFIG.schoolYear.startDate);
  const schoolEnd = toDateOnly(CONFIG.schoolYear.endDate);
  const intervalStart = toDateOnly(CONFIG.schoolYear.intervalStart);
  const intervalEnd = toDateOnly(CONFIG.schoolYear.intervalEnd);

  let total = 0;

  for (
    let cursor = schoolStart;
    cursor.getTime() <= schoolEnd.getTime();
    cursor = addDays(cursor, 1)
  ) {
    if (!isWeekday(cursor)) continue;
    if (isInsideRange(cursor, intervalStart, intervalEnd)) continue;
    total += 1;
  }

  return total;
}

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function calculateCpfDigit(base: string) {
  let factor = base.length + 1;
  let total = 0;

  for (const digit of base) {
    total += Number(digit) * factor;
    factor -= 1;
  }

  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function buildCpf(seed: number) {
  const base = String(100000000 + seed).slice(-9);
  const firstDigit = calculateCpfDigit(base);
  const secondDigit = calculateCpfDigit(`${base}${firstDigit}`);
  return `${base}${firstDigit}${secondDigit}`;
}

function buildPhone(seed: number) {
  return `1199${pad(seed, 6)}`;
}

function buildBirthDate(year: number, seed: number) {
  const month = (seed % 12) + 1;
  const day = (seed % 28) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function makeEmail(prefix: string, index: number) {
  return `${prefix}${pad(index, 3)}.TCHA@MSINFOR.COM`;
}

async function requestJson<T>(
  baseUrl: string,
  method: string,
  path: string,
  options: RequestOptions = {},
) {
  const expectedStatuses = Array.isArray(options.expectedStatus)
    ? options.expectedStatus
    : [options.expectedStatus ?? (method === "POST" ? 201 : 200)];
  const headers: Record<string, string> = {
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const rawText = await response.text();
  const payload = rawText ? JSON.parse(rawText) : null;

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `[HTTP ${method}] ${path} => ${response.status} ${response.statusText}\n${rawText}`,
    );
  }

  return payload as T;
}

async function login(
  baseUrl: string,
  email: string,
  password: string,
  tenantId: string,
) {
  const doLogin = () =>
    requestJson<LoginResponse>(baseUrl, "POST", "/api/v1/auth/login", {
      body: {
        email,
        password,
        tenantId,
      },
    });

  let response = await doLogin();

  if (response.status === "EMAIL_CONFIRMATION_REQUIRED") {
    const verificationLink = String(response.devVerificationLink || "").trim();
    assert(
      verificationLink,
      `Login exigiu confirmação de e-mail para ${email}, mas sem devVerificationLink.`,
    );

    const verificationToken =
      new URL(verificationLink).searchParams.get("token") || "";
    assert(
      verificationToken,
      `Link de confirmação sem token para ${email}.`,
    );

    const verificationResult = await requestJson<{ status: string }>(
      baseUrl,
      "GET",
      `/api/v1/auth/verify-email?token=${encodeURIComponent(verificationToken)}`,
    );
    assert(
      verificationResult.status === "SUCCESS",
      `Falha ao confirmar o e-mail de ${email}.`,
    );

    response = await doLogin();
  }

  assert(response.status === "SUCCESS", `Login não retornou SUCCESS para ${email}.`);
  assert(response.access_token, `Login sem token para ${email}.`);
  assert(response.user, `Login sem usuário para ${email}.`);

  return {
    token: response.access_token,
    user: response.user,
  } satisfies Session;
}

async function bootstrapApp() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
  });

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: createValidationException,
    }),
  );
  app.enableCors();

  await app.listen(0);

  const server = app.getHttpServer();
  const address = server.address();
  const port =
    typeof address === "object" && address ? Number(address.port) : Number(process.env.PORT || 3001);

  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

async function ensureTenantDoesNotExist(baseUrl: string) {
  const tenants = await requestJson<
    Array<{ id: string; name: string; document?: string | null }>
  >(baseUrl, "GET", "/api/v1/tenants", {
    headers: {
      "x-msinfor-master-pass": buildMasterPass(new Date()),
    },
  });

  const existing = tenants.find(
    (tenant) =>
      tenant.name === CONFIG.tenant.name ||
      tenant.document === CONFIG.tenant.document,
  );

  if (existing) {
    throw new Error(
      `Já existe uma escola ${CONFIG.tenant.name} no banco alvo (${existing.id}). Interrompi para evitar duplicidade.`,
    );
  }
}

async function main() {
  const startedAt = Date.now();
  const prisma = new PrismaClient();
  const { app, baseUrl } = await bootstrapApp();

  try {
    console.log("[TCHA SMOKE] Iniciando preflight...");
    await ensureTenantDoesNotExist(baseUrl);

    console.log("[TCHA SMOKE] Criando escola TCHA...");
    const tenantCreation = await requestJson<{
      tenant: { id: string; name: string; document?: string | null };
      admin: { id: string; email: string };
    }>(baseUrl, "POST", "/api/v1/tenants", {
      headers: {
        "x-msinfor-master-pass": buildMasterPass(new Date()),
      },
      body: {
        name: CONFIG.tenant.name,
        document: CONFIG.tenant.document,
        email: CONFIG.tenant.email,
        city: CONFIG.tenant.city,
        state: CONFIG.tenant.state,
        adminName: CONFIG.tenant.adminName,
        adminEmail: CONFIG.tenant.adminEmail,
        adminPassword: CONFIG.tenant.adminPassword,
      },
    });

    const tenantId = tenantCreation.tenant.id;
    const adminSession = await login(
      baseUrl,
      CONFIG.tenant.adminEmail,
      CONFIG.tenant.adminPassword,
      tenantId,
    );

    console.log("[TCHA SMOKE] Criando ano letivo, séries, turmas e matérias...");
    const schoolYear = await requestJson<{ id: string; year: number }>(
      baseUrl,
      "POST",
      "/api/v1/school-years",
      {
        token: adminSession.token,
        body: {
          year: CONFIG.schoolYear.year,
          startDate: CONFIG.schoolYear.startDate,
          endDate: CONFIG.schoolYear.endDate,
          isActive: true,
        },
      },
    );

    const series: NamedEntity[] = [];
    for (const item of CONFIG.series) {
      series.push(
        await requestJson<NamedEntity>(baseUrl, "POST", "/api/v1/series", {
          token: adminSession.token,
          body: item,
        }),
      );
    }

    const classes: NamedEntity[] = [];
    for (const item of CONFIG.classes) {
      classes.push(
        await requestJson<NamedEntity>(baseUrl, "POST", "/api/v1/classes", {
          token: adminSession.token,
          body: {
            ...item,
            defaultMonthlyFee: 650,
          },
        }),
      );
    }

    const seriesClassSpecs = [
      { seriesId: series[0].id, classId: classes[0].id },
      { seriesId: series[0].id, classId: classes[1].id },
      { seriesId: series[1].id, classId: classes[2].id },
      { seriesId: series[1].id, classId: classes[3].id },
      { seriesId: series[2].id, classId: classes[4].id },
    ];

    const seriesClasses: Array<{ id: string; seriesId: string; classId: string }> = [];
    for (const item of seriesClassSpecs) {
      seriesClasses.push(
        await requestJson<{ id: string; seriesId: string; classId: string }>(
          baseUrl,
          "POST",
          "/api/v1/series-classes",
          {
            token: adminSession.token,
            body: item,
          },
        ),
      );
    }

    const subjects: NamedEntity[] = [];
    for (const name of CONFIG.subjects) {
      subjects.push(
        await requestJson<NamedEntity>(baseUrl, "POST", "/api/v1/subjects", {
          token: adminSession.token,
          body: { name },
        }),
      );
    }

    console.log("[TCHA SMOKE] Criando 12 professores e vínculos professor x matéria...");
    const teachers: NamedEntity[] = [];
    for (let index = 0; index < 12; index += 1) {
      teachers.push(
        await requestJson<NamedEntity>(baseUrl, "POST", "/api/v1/teachers", {
          token: adminSession.token,
          body: {
            name: `PROFESSOR ${pad(index + 1, 2)} TCHA`,
            birthDate: buildBirthDate(1980 + (index % 8), index + 1),
            cpf: buildCpf(10_000 + index),
            email: makeEmail("PROF", index + 1),
            password: CONFIG.passwords.teacher,
            phone: buildPhone(index + 1),
            cellphone1: buildPhone(100 + index + 1),
            city: CONFIG.tenant.city,
            state: CONFIG.tenant.state,
          },
        }),
      );
    }

    const teacherSubjectPlan = [
      { teacherIndex: 0, subjectIndex: 0, hourlyRate: 55 },
      { teacherIndex: 1, subjectIndex: 1, hourlyRate: 56 },
      { teacherIndex: 2, subjectIndex: 2, hourlyRate: 57 },
      { teacherIndex: 3, subjectIndex: 3, hourlyRate: 58 },
      { teacherIndex: 4, subjectIndex: 4, hourlyRate: 59 },
      { teacherIndex: 5, subjectIndex: 5, hourlyRate: 60 },
      { teacherIndex: 6, subjectIndex: 6, hourlyRate: 61 },
      { teacherIndex: 7, subjectIndex: 7, hourlyRate: 62 },
      { teacherIndex: 0, subjectIndex: 8, hourlyRate: 63 },
      { teacherIndex: 1, subjectIndex: 9, hourlyRate: 64 },
      { teacherIndex: 8, subjectIndex: 0, hourlyRate: 58 },
      { teacherIndex: 9, subjectIndex: 1, hourlyRate: 59 },
      { teacherIndex: 10, subjectIndex: 4, hourlyRate: 60 },
      { teacherIndex: 11, subjectIndex: 6, hourlyRate: 61 },
    ];

    const teacherSubjectAssignments: TeacherSubjectAssignment[] = [];
    for (const item of teacherSubjectPlan) {
      const assignment = await requestJson<TeacherSubjectAssignment>(
        baseUrl,
        "POST",
        `/api/v1/teachers/${teachers[item.teacherIndex].id}/subjects`,
        {
          token: adminSession.token,
          body: {
            subjectId: subjects[item.subjectIndex].id,
            hourlyRate: item.hourlyRate,
            effectiveFrom: CONFIG.schoolYear.startDate,
          },
        },
      );

      teacherSubjectAssignments.push({
        id: assignment.id,
        teacherId: teachers[item.teacherIndex].id,
        subjectId: subjects[item.subjectIndex].id,
      });
    }

    console.log("[TCHA SMOKE] Criando 100 alunos...");
    const students: NamedEntity[] = [];
    for (let index = 0; index < 100; index += 1) {
      students.push(
        await requestJson<NamedEntity>(baseUrl, "POST", "/api/v1/students", {
          token: adminSession.token,
          body: {
            name: `ALUNO ${pad(index + 1, 3)} TCHA`,
            birthDate: buildBirthDate(2010 + (index % 5), index + 1),
            cpf: buildCpf(20_000 + index),
            email: makeEmail("ALUNO", index + 1),
            password: CONFIG.passwords.student,
            monthlyFee: 650 + (index % 4) * 15,
            notes: `ALUNO DE TESTE ${pad(index + 1, 3)}`,
            city: CONFIG.tenant.city,
            state: CONFIG.tenant.state,
          },
        }),
      );
    }

    console.log("[TCHA SMOKE] Vinculando alunos às 5 turmas...");
    for (let index = 0; index < students.length; index += 1) {
      const seriesClass = seriesClasses[Math.floor(index / 20)];
      await requestJson(
        baseUrl,
        "PATCH",
        `/api/v1/students/${students[index].id}/series-class-assignment`,
        {
          token: adminSession.token,
          body: {
            seriesClassId: seriesClass.id,
          },
        },
      );
    }

    console.log("[TCHA SMOKE] Criando 200 responsáveis...");
    const guardians: NamedEntity[] = [];
    for (let index = 0; index < 200; index += 1) {
      guardians.push(
        await requestJson<NamedEntity>(baseUrl, "POST", "/api/v1/guardians", {
          token: adminSession.token,
          body: {
            name: `RESPONSAVEL ${pad(index + 1, 3)} TCHA`,
            birthDate: buildBirthDate(1975 + (index % 10), index + 1),
            cpf: buildCpf(30_000 + index),
            email: makeEmail("RESP", index + 1),
            password: CONFIG.passwords.guardian,
            phone: buildPhone(500 + index + 1),
            cellphone1: buildPhone(800 + index + 1),
            city: CONFIG.tenant.city,
            state: CONFIG.tenant.state,
          },
        }),
      );
    }

    console.log("[TCHA SMOKE] Amarrando 2 responsáveis por aluno...");
    for (let index = 0; index < students.length; index += 1) {
      const father = guardians[index * 2];
      const mother = guardians[index * 2 + 1];

      await requestJson(
        baseUrl,
        "POST",
        `/api/v1/guardians/${father.id}/students`,
        {
          token: adminSession.token,
          body: {
            studentId: students[index].id,
            kinship: "PAI",
          },
        },
      );

      await requestJson(
        baseUrl,
        "POST",
        `/api/v1/guardians/${mother.id}/students`,
        {
          token: adminSession.token,
          body: {
            studentId: students[index].id,
            kinship: "MAE",
          },
        },
      );
    }

    console.log("[TCHA SMOKE] Gerando grade horária aleatória...");
    const slotPatterns = [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 10, 11],
      [8, 9, 12, 13, 2],
      [3, 4, 5, 6, 7],
      [10, 11, 12, 13, 0],
    ];

    for (let dayIndex = 0; dayIndex < CONFIG.weekdays.length; dayIndex += 1) {
      for (let slotIndex = 0; slotIndex < CONFIG.slots.length; slotIndex += 1) {
        const dayOfWeek = CONFIG.weekdays[dayIndex];
        const slot = CONFIG.slots[slotIndex];
        const pattern = slotPatterns[(dayIndex + slotIndex) % slotPatterns.length];

        for (
          let seriesClassIndex = 0;
          seriesClassIndex < seriesClasses.length;
          seriesClassIndex += 1
        ) {
          const assignmentIndex =
            pattern[(seriesClassIndex + dayIndex) % pattern.length];

          await requestJson(
            baseUrl,
            "POST",
            "/api/v1/class-schedule-items",
            {
              token: adminSession.token,
              body: {
                schoolYearId: schoolYear.id,
                seriesClassId: seriesClasses[seriesClassIndex].id,
                dayOfWeek,
                teacherSubjectId:
                  teacherSubjectAssignments[assignmentIndex].id,
                startTime: slot.startTime,
                endTime: slot.endTime,
              },
            },
          );
        }
      }
    }

    console.log("[TCHA SMOKE] Gerando 5 calendários anuais com recesso de julho...");
    for (const seriesClass of seriesClasses) {
      await requestJson(baseUrl, "POST", "/api/v1/lesson-calendars", {
        token: adminSession.token,
        body: {
          schoolYearId: schoolYear.id,
          seriesClassId: seriesClass.id,
          periods: [
            {
              periodType: "AULA",
              startDate: CONFIG.schoolYear.startDate,
              endDate: CONFIG.schoolYear.endDate,
            },
            {
              periodType: "INTERVALO",
              startDate: CONFIG.schoolYear.intervalStart,
              endDate: CONFIG.schoolYear.intervalEnd,
            },
          ],
        },
      });
    }

    console.log("[TCHA SMOKE] Simulando comunicação WEB <-> PWA...");
    const teacherSession = await login(
      baseUrl,
      teachers[0].email || "",
      CONFIG.passwords.teacher,
      tenantId,
    );

    const teacherSchedule = await requestJson<any>(
      baseUrl,
      "GET",
      "/api/v1/class-schedule-items/me",
      {
        token: teacherSession.token,
      },
    );
    assert(
      Array.isArray(teacherSchedule.items) && teacherSchedule.items.length > 0,
      "Professor sem grade própria retornada.",
    );

    const simulatedLessonItem = await prisma.lessonCalendarItem.findFirst({
      where: {
        tenantId,
        canceledAt: null,
        lessonDate: toDateOnly(CONFIG.referenceDate),
        teacherSubject: {
          is: {
            teacherId: teachers[0].id,
          },
        },
      },
      include: {
        teacherSubject: {
          include: {
            teacher: true,
            subject: true,
          },
        },
        seriesClass: {
          include: {
            series: true,
            class: true,
          },
        },
      },
      orderBy: [{ startTime: "asc" }],
    });

    assert(
      simulatedLessonItem,
      "Nenhuma aula anual foi encontrada para o professor selecionado na data de referência.",
    );

    const teacherAgenda = await requestJson<any>(
      baseUrl,
      "GET",
      `/api/v1/lesson-events/my-agenda?date=${CONFIG.referenceDate}`,
      {
        token: teacherSession.token,
      },
    );
    assert(
      typeof teacherAgenda.totalItems === "number" && teacherAgenda.totalItems > 0,
      "Agenda do professor não retornou itens.",
    );

    const teacherCalendar = await requestJson<any>(
      baseUrl,
      "GET",
      `/api/v1/lesson-events/my-calendar?referenceDate=${CONFIG.referenceDate}&view=MONTH`,
      {
        token: teacherSession.token,
      },
    );
    assert(
      typeof teacherCalendar.rangeStart === "string" &&
        typeof teacherCalendar.rangeEnd === "string",
      "Calendário mensal do professor não retornou faixa válida.",
    );

    const attendanceSnapshot = await requestJson<any>(
      baseUrl,
      "GET",
      `/api/v1/lesson-attendances/by-lesson-item/${simulatedLessonItem.id}`,
      {
        token: teacherSession.token,
      },
    );
    assert(
      Array.isArray(attendanceSnapshot.students) &&
        attendanceSnapshot.students.length > 0,
      "A chamada não retornou alunos da turma.",
    );

    const attendancePayload = {
      attendances: attendanceSnapshot.students.map(
        (student: { studentId: string }, index: number) => ({
          studentId: student.studentId,
          status: index === 0 ? "FALTOU" : "PRESENTE",
          notes: index === 0 ? "FALTA JUSTIFICADA EM TESTE" : "PRESENCA OK",
        }),
      ),
      notifyStudents: true,
      notifyGuardians: true,
    };

    await requestJson(
      baseUrl,
      "PUT",
      `/api/v1/lesson-attendances/by-lesson-item/${simulatedLessonItem.id}`,
      {
        token: teacherSession.token,
        body: attendancePayload,
      },
    );

    await requestJson(
      baseUrl,
      "POST",
      "/api/v1/lesson-events",
      {
        token: teacherSession.token,
        body: {
          lessonCalendarItemId: simulatedLessonItem.id,
          eventType: "PROVA",
          title: "PROVA BIMESTRAL TCHA",
          description: "AVALIAÇÃO GERADA PELO SMOKE TEST TCHA",
          notifyStudents: true,
          notifyGuardians: true,
          notifyByEmail: false,
        },
      },
    );

    const createdLessonEvent = await prisma.lessonEvent.findFirst({
      where: {
        tenantId,
        lessonCalendarItemId: simulatedLessonItem.id,
        eventType: "PROVA",
        canceledAt: null,
      },
      orderBy: [{ createdAt: "desc" }],
    });
    assert(createdLessonEvent, "O evento da aula não foi persistido.");

    const classEnrollments = await prisma.enrollment.findMany({
      where: {
        tenantId,
        seriesClassId: simulatedLessonItem.seriesClassId,
        schoolYearId: schoolYear.id,
        status: "ATIVO",
        canceledAt: null,
      },
      include: {
        student: true,
      },
      orderBy: [{ student: { name: "asc" } }],
    });
    assert(classEnrollments.length > 0, "Não há alunos ativos na turma simulada.");

    await requestJson(
      baseUrl,
      "PUT",
      `/api/v1/lesson-assessments/by-event/${createdLessonEvent.id}`,
      {
        token: teacherSession.token,
        body: {
          title: "PROVA BIMESTRAL TCHA",
          description: "NOTAS LANÇADAS PELO SMOKE TEST",
          maxScore: "10",
          notifyStudents: true,
          notifyGuardians: true,
          notifyByEmail: false,
          grades: classEnrollments.slice(0, 5).map((enrollment, index) => ({
            studentId: enrollment.studentId,
            score: (8.5 - index * 0.5).toFixed(1),
            remarks: `NOTA TESTE ${pad(index + 1)}`,
          })),
        },
      },
    );

    const createdAssessment = await prisma.lessonAssessment.findFirst({
      where: {
        tenantId,
        lessonEventId: createdLessonEvent.id,
        canceledAt: null,
      },
    });
    assert(createdAssessment, "A avaliação da aula não foi persistida.");

    const webCalendarView = await requestJson<any>(
      baseUrl,
      "GET",
      `/api/v1/lesson-calendars/school-calendar-events?referenceDate=${CONFIG.referenceDate}`,
      {
        token: adminSession.token,
      },
    );
    const webSeesTeacherEvent = Array.isArray(webCalendarView.lessonItems)
      ? webCalendarView.lessonItems.some((item: any) =>
          Array.isArray(item.events)
            ? item.events.some((event: any) => event.id === createdLessonEvent.id)
            : false,
        )
      : false;
    assert(
      webSeesTeacherEvent,
      "O painel web não enxergou o evento criado pelo professor.",
    );

    const simulatedStudent = classEnrollments[0].student;
    assert(simulatedStudent.email, "Aluno simulado sem email.");

    const guardianLink = await prisma.guardianStudent.findFirst({
      where: {
        tenantId,
        studentId: simulatedStudent.id,
        canceledAt: null,
      },
      include: {
        guardian: true,
      },
      orderBy: [{ guardian: { name: "asc" } }],
    });
    assert(guardianLink?.guardian.email, "Responsável simulado sem email.");

    const studentSession = await login(
      baseUrl,
      simulatedStudent.email,
      CONFIG.passwords.student,
      tenantId,
    );
    const guardianSession = await login(
      baseUrl,
      guardianLink.guardian.email,
      CONFIG.passwords.guardian,
      tenantId,
    );

    const studentSchedule = await requestJson<any>(
      baseUrl,
      "GET",
      "/api/v1/class-schedule-items/me",
      {
        token: studentSession.token,
      },
    );
    assert(
      Array.isArray(studentSchedule.items) && studentSchedule.items.length > 0,
      "Aluno sem grade própria retornada.",
    );

    const guardianSchedule = await requestJson<any>(
      baseUrl,
      "GET",
      "/api/v1/class-schedule-items/me",
      {
        token: guardianSession.token,
      },
    );
    assert(
      Array.isArray(guardianSchedule.students) &&
        guardianSchedule.students.length > 0,
      "Responsável sem grade dos dependentes.",
    );

    const studentSummary = await requestJson<any>(
      baseUrl,
      "GET",
      "/api/v1/students/me/pwa-summary",
      {
        token: studentSession.token,
      },
    );
    assert(
      studentSummary && typeof studentSummary === "object",
      "Resumo PWA do aluno inválido.",
    );

    const guardianSummary = await requestJson<any>(
      baseUrl,
      "GET",
      "/api/v1/guardians/me/pwa-summary",
      {
        token: guardianSession.token,
      },
    );
    assert(
      guardianSummary && typeof guardianSummary === "object",
      "Resumo PWA do responsável inválido.",
    );

    const studentNotifications = await requestJson<any[]>(
      baseUrl,
      "GET",
      "/api/v1/notifications/my",
      {
        token: studentSession.token,
      },
    );
    assert(studentNotifications.length > 0, "Aluno não recebeu notificações.");

    const studentUnreadBefore = await requestJson<{ count: number }>(
      baseUrl,
      "GET",
      "/api/v1/notifications/my/unread-summary",
      {
        token: studentSession.token,
      },
    );
    assert(
      studentUnreadBefore.count > 0,
      "Resumo de não lidas do aluno veio zerado.",
    );

    const studentIdsToRead = studentNotifications
      .slice(0, Math.min(2, studentNotifications.length))
      .map((notification) => notification.id);
    const studentReadBatch = await requestJson<{ updatedCount: number }>(
      baseUrl,
      "POST",
      "/api/v1/notifications/my/read-batch",
      {
        token: studentSession.token,
        body: {
          ids: studentIdsToRead,
        },
        expectedStatus: 201,
      },
    );
    assert(
      studentReadBatch.updatedCount === studentIdsToRead.length,
      "Nem todas as notificações do aluno foram marcadas como lidas.",
    );

    const studentUnreadAfter = await requestJson<{ count: number }>(
      baseUrl,
      "GET",
      "/api/v1/notifications/my/unread-summary",
      {
        token: studentSession.token,
      },
    );
    assert(
      studentUnreadAfter.count < studentUnreadBefore.count,
      "O contador de notificações do aluno não diminuiu.",
    );

    const guardianNotifications = await requestJson<any[]>(
      baseUrl,
      "GET",
      "/api/v1/notifications/my",
      {
        token: guardianSession.token,
      },
    );
    assert(
      guardianNotifications.length > 0,
      "Responsável não recebeu notificações.",
    );

    const guardianUnreadBefore = await requestJson<{ count: number }>(
      baseUrl,
      "GET",
      "/api/v1/notifications/my/unread-summary",
      {
        token: guardianSession.token,
      },
    );
    assert(
      guardianUnreadBefore.count > 0,
      "Resumo de não lidas do responsável veio zerado.",
    );

    const guardianIdsToRead = guardianNotifications
      .slice(0, Math.min(2, guardianNotifications.length))
      .map((notification) => notification.id);
    const guardianReadBatch = await requestJson<{ updatedCount: number }>(
      baseUrl,
      "POST",
      "/api/v1/notifications/my/read-batch",
      {
        token: guardianSession.token,
        body: {
          ids: guardianIdsToRead,
        },
        expectedStatus: 201,
      },
    );
    assert(
      guardianReadBatch.updatedCount === guardianIdsToRead.length,
      "Nem todas as notificações do responsável foram marcadas como lidas.",
    );

    const guardianUnreadAfter = await requestJson<{ count: number }>(
      baseUrl,
      "GET",
      "/api/v1/notifications/my/unread-summary",
      {
        token: guardianSession.token,
      },
    );
    assert(
      guardianUnreadAfter.count < guardianUnreadBefore.count,
      "O contador de notificações do responsável não diminuiu.",
    );

    console.log("[TCHA SMOKE] Validando consistência final no banco...");
    const [
      tenant,
      schoolYearsCount,
      activeSchoolYear,
      seriesCount,
      classCount,
      seriesClassCount,
      subjectCount,
      teacherCount,
      studentCount,
      guardianCount,
      enrollmentCount,
      guardianLinkCount,
      classScheduleCount,
      lessonCalendarCount,
      lessonCalendarItemCount,
      lessonEventsCount,
      assessmentCount,
      assessmentGradeCount,
      attendanceCount,
      notificationCount,
      sampleStudent,
      sampleGuardian,
      sampleTeacher,
    ] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
      }),
      prisma.schoolYear.count({ where: { tenantId, canceledAt: null } }),
      prisma.schoolYear.findFirst({
        where: { tenantId, isActive: true, canceledAt: null },
      }),
      prisma.series.count({ where: { tenantId, canceledAt: null } }),
      prisma.class.count({ where: { tenantId, canceledAt: null } }),
      prisma.seriesClass.count({ where: { tenantId, canceledAt: null } }),
      prisma.subject.count({ where: { tenantId, canceledAt: null } }),
      prisma.teacher.count({ where: { tenantId, canceledAt: null } }),
      prisma.student.count({ where: { tenantId, canceledAt: null } }),
      prisma.guardian.count({ where: { tenantId, canceledAt: null } }),
      prisma.enrollment.count({
        where: { tenantId, schoolYearId: schoolYear.id, canceledAt: null },
      }),
      prisma.guardianStudent.count({ where: { tenantId, canceledAt: null } }),
      prisma.classScheduleItem.count({ where: { tenantId, canceledAt: null } }),
      prisma.lessonCalendar.count({ where: { tenantId, canceledAt: null } }),
      prisma.lessonCalendarItem.count({ where: { tenantId, canceledAt: null } }),
      prisma.lessonEvent.count({ where: { tenantId, canceledAt: null } }),
      prisma.lessonAssessment.count({ where: { tenantId, canceledAt: null } }),
      prisma.lessonAssessmentGrade.count({
        where: { tenantId, canceledAt: null },
      }),
      prisma.lessonAttendance.count({ where: { tenantId, canceledAt: null } }),
      prisma.notification.count({ where: { tenantId, canceledAt: null } }),
      prisma.student.findFirst({
        where: { tenantId, canceledAt: null },
      }),
      prisma.guardian.findFirst({
        where: { tenantId, canceledAt: null },
      }),
      prisma.teacher.findFirst({
        where: { tenantId, canceledAt: null },
      }),
    ]);
    const expectedLessonCalendarItemCount =
      countSchoolDays() * CONFIG.slots.length * seriesClasses.length;

    assert(tenant?.createdBy, "Tenant sem auditoria de criação.");
    assert(tenant?.updatedBy, "Tenant sem auditoria de atualização.");
    assert(activeSchoolYear?.year === CONFIG.schoolYear.year, "Ano letivo ativo incorreto.");
    assert(schoolYearsCount === 1, "Quantidade de anos letivos divergente.");
    assert(seriesCount === 3, "Quantidade de séries divergente.");
    assert(classCount === 5, "Quantidade de turmas divergente.");
    assert(seriesClassCount === 5, "Quantidade de vínculos série x turma divergente.");
    assert(subjectCount === 10, "Quantidade de matérias divergente.");
    assert(teacherCount === 12, "Quantidade de professores divergente.");
    assert(studentCount === 100, "Quantidade de alunos divergente.");
    assert(guardianCount === 200, "Quantidade de responsáveis divergente.");
    assert(enrollmentCount === 100, "Quantidade de matrículas divergente.");
    assert(guardianLinkCount === 200, "Quantidade de vínculos responsável x aluno divergente.");
    assert(classScheduleCount === 125, "Quantidade de itens da grade semanal divergente.");
    assert(lessonCalendarCount === 5, "Quantidade de calendários anuais divergente.");
    assert(
      lessonCalendarItemCount === expectedLessonCalendarItemCount,
      "Quantidade de aulas geradas no calendário anual divergente.",
    );
    assert(lessonEventsCount >= 1, "Nenhum evento de aula foi persistido.");
    assert(assessmentCount >= 1, "Nenhuma avaliação foi persistida.");
    assert(assessmentGradeCount >= 5, "Nenhuma nota foi persistida.");
    assert(attendanceCount >= classEnrollments.length, "A chamada não foi persistida.");
    assert(notificationCount > 0, "Nenhuma notificação foi persistida.");
    assert(sampleStudent?.name === sampleStudent?.name.toUpperCase(), "Aluno fora do padrão uppercase.");
    assert(sampleGuardian?.name === sampleGuardian?.name.toUpperCase(), "Responsável fora do padrão uppercase.");
    assert(sampleTeacher?.name === sampleTeacher?.name.toUpperCase(), "Professor fora do padrão uppercase.");

    const teacherSubjectCounts = await prisma.teacherSubject.findMany({
      where: { tenantId, canceledAt: null },
      select: { teacherId: true },
    });
    const multiSubjectTeacherCount = Array.from(
      teacherSubjectCounts.reduce((accumulator, item) => {
        accumulator.set(
          item.teacherId,
          (accumulator.get(item.teacherId) || 0) + 1,
        );
        return accumulator;
      }, new Map<string, number>()).values(),
    ).filter((count) => count > 1).length;
    assert(
      multiSubjectTeacherCount === 2,
      "A quantidade de professores com mais de uma matéria divergiu do esperado.",
    );

    const guardianLinksPerStudent = await prisma.guardianStudent.groupBy({
      by: ["studentId"],
      where: { tenantId, canceledAt: null },
      _count: { studentId: true },
    });
    assert(
      guardianLinksPerStudent.every((item) => item._count.studentId === 2),
      "Nem todos os alunos ficaram com 2 responsáveis.",
    );

    const summary = {
      status: "SUCCESS",
      tenantId,
      tenantName: CONFIG.tenant.name,
      databaseUrl: process.env.DATABASE_URL || null,
      elapsedMs: Date.now() - startedAt,
      created: {
        schoolYears: schoolYearsCount,
        series: seriesCount,
        classes: classCount,
        seriesClasses: seriesClassCount,
        subjects: subjectCount,
        teachers: teacherCount,
        students: studentCount,
        guardians: guardianCount,
        enrollments: enrollmentCount,
        guardianLinks: guardianLinkCount,
        classScheduleItems: classScheduleCount,
        lessonCalendars: lessonCalendarCount,
        lessonCalendarItems: lessonCalendarItemCount,
      },
      validations: {
        twoGuardiansPerStudent: true,
        twoMultiSubjectTeachers: true,
        annualBreakApplied: {
          breakStart: CONFIG.schoolYear.intervalStart,
          breakEnd: CONFIG.schoolYear.intervalEnd,
          plannedSchoolDays: countSchoolDays(),
          generatedLessonItems: lessonCalendarItemCount,
        },
        webReadTeacherEvent: webSeesTeacherEvent,
        studentPwaNotified: studentNotifications.length > 0,
        guardianPwaNotified: guardianNotifications.length > 0,
      },
      simulatedUsers: {
        teacher: teachers[0].email,
        student: simulatedStudent.email,
        guardian: guardianLink.guardian.email,
      },
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

main().catch((error) => {
  console.error("[TCHA SMOKE] Falha:", error);
  process.exitCode = 1;
});
