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
  };
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
  tenantName: "TCHA",
  adminEmail: "ADMIN.TCHA@MSINFOR.COM",
  adminPassword: "Admin001",
  teacherEmail: "PROF001.TCHA@MSINFOR.COM",
  teacherPassword: "Prof1234",
  studentPassword: "Aluno1234",
  guardianPassword: "Resp1234",
  minLessonDate: "2026-03-03",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function runStamp() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

function fmtDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
  });
}

function findAssessmentInSummary(summary: any, title: string) {
  const subjects = Array.isArray(summary?.grades?.bySubject)
    ? summary.grades.bySubject
    : [];

  for (const subject of subjects) {
    const assessments = Array.isArray(subject?.assessments)
      ? subject.assessments
      : [];
    const match = assessments.find(
      (assessment: any) => String(assessment?.title || "") === title,
    );
    if (match) {
      return {
        subjectName: subject.subjectName,
        score:
          typeof match.score === "number"
            ? match.score
            : match.score === null
              ? null
              : Number(match.score),
        remarks: match.remarks || null,
      };
    }
  }

  return null;
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
    typeof address === "object" && address
      ? Number(address.port)
      : Number(process.env.PORT || 3001);

  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

async function main() {
  const prisma = new PrismaClient();
  const { app, baseUrl } = await bootstrapApp();

  try {
    console.log("[TCHA VISIBILITY] Localizando tenant TCHA...");
    const tenants = await requestJson<
      Array<{ id: string; name: string; document?: string | null }>
    >(baseUrl, "GET", "/api/v1/tenants", {
      headers: {
        "x-msinfor-master-pass": buildMasterPass(new Date()),
      },
    });
    const tenant = tenants.find((item) => item.name === CONFIG.tenantName);
    assert(tenant, "A escola TCHA não foi encontrada no banco alvo.");

    const adminSession = await login(
      baseUrl,
      CONFIG.adminEmail,
      CONFIG.adminPassword,
      tenant.id,
    );
    const teacherSession = await login(
      baseUrl,
      CONFIG.teacherEmail,
      CONFIG.teacherPassword,
      tenant.id,
    );

    const targetLessonItem = await prisma.lessonCalendarItem.findFirst({
      where: {
        tenantId: tenant.id,
        canceledAt: null,
        lessonDate: {
          gte: toDateOnly(CONFIG.minLessonDate),
        },
        teacherSubject: {
          is: {
            tenantId: tenant.id,
            canceledAt: null,
            teacher: {
              email: CONFIG.teacherEmail,
              canceledAt: null,
            },
          },
        },
        lessonEvents: {
          none: {
            eventType: "PROVA",
            canceledAt: null,
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
      orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }],
    });
    assert(
      targetLessonItem,
      "Não encontrei uma aula elegível sem PROVA para rodar o teste de visibilidade.",
    );

    const classEnrollments = await prisma.enrollment.findMany({
      where: {
        tenantId: tenant.id,
        schoolYearId: targetLessonItem.schoolYearId,
        seriesClassId: targetLessonItem.seriesClassId,
        status: "ATIVO",
        canceledAt: null,
      },
      include: {
        student: true,
      },
      orderBy: [{ student: { name: "asc" } }],
    });
    assert(classEnrollments.length >= 2, "A turma alvo não possui alunos suficientes.");

    const studentA = classEnrollments[0].student;
    const studentB = classEnrollments[1].student;
    assert(studentA.email, "Aluno A sem email.");
    assert(studentB.email, "Aluno B sem email.");

    const guardianLinkA = await prisma.guardianStudent.findFirst({
      where: {
        tenantId: tenant.id,
        studentId: studentA.id,
        canceledAt: null,
      },
      include: {
        guardian: true,
      },
      orderBy: [{ guardian: { name: "asc" } }],
    });
    const guardianLinkB = await prisma.guardianStudent.findFirst({
      where: {
        tenantId: tenant.id,
        studentId: studentB.id,
        canceledAt: null,
      },
      include: {
        guardian: true,
      },
      orderBy: [{ guardian: { name: "asc" } }],
    });
    assert(guardianLinkA?.guardian.email, "Responsável A sem email.");
    assert(guardianLinkB?.guardian.email, "Responsável B sem email.");

    const studentSessionA = await login(
      baseUrl,
      studentA.email,
      CONFIG.studentPassword,
      tenant.id,
    );
    const studentSessionB = await login(
      baseUrl,
      studentB.email,
      CONFIG.studentPassword,
      tenant.id,
    );
    const guardianSessionA = await login(
      baseUrl,
      guardianLinkA.guardian.email,
      CONFIG.guardianPassword,
      tenant.id,
    );
    const guardianSessionB = await login(
      baseUrl,
      guardianLinkB.guardian.email,
      CONFIG.guardianPassword,
      tenant.id,
    );

    console.log("[TCHA VISIBILITY] Simulando prova, chamada e notas...");
    const uniqueTitle = `PROVA VISIBILIDADE TCHA ${runStamp()}`;

    const attendanceSnapshot = await requestJson<any>(
      baseUrl,
      "GET",
      `/api/v1/lesson-attendances/by-lesson-item/${targetLessonItem.id}`,
      {
        token: teacherSession.token,
      },
    );
    assert(
      Array.isArray(attendanceSnapshot.students) &&
        attendanceSnapshot.students.length >= 2,
      "A chamada do professor não retornou alunos suficientes.",
    );

    const attendances = attendanceSnapshot.students.map((item: any) => {
      if (item.studentId === studentA.id) {
        return {
          studentId: item.studentId,
          status: "FALTOU",
          notes: "FALTA NA PROVA DE VISIBILIDADE",
        };
      }
      if (item.studentId === studentB.id) {
        return {
          studentId: item.studentId,
          status: "PRESENTE",
          notes: "PRESENTE NA PROVA DE VISIBILIDADE",
        };
      }
      return {
        studentId: item.studentId,
        status: "PRESENTE",
        notes: "PRESENTE",
      };
    });

    await requestJson(
      baseUrl,
      "PUT",
      `/api/v1/lesson-attendances/by-lesson-item/${targetLessonItem.id}`,
      {
        token: teacherSession.token,
        body: {
          attendances,
          notifyStudents: true,
          notifyGuardians: true,
        },
      },
    );

    await requestJson(
      baseUrl,
      "POST",
      "/api/v1/lesson-events",
      {
        token: teacherSession.token,
        body: {
          lessonCalendarItemId: targetLessonItem.id,
          eventType: "PROVA",
          title: uniqueTitle,
          description: "PROVA PARA VALIDAR VISIBILIDADE DE ALUNO E RESPONSAVEL",
          notifyStudents: true,
          notifyGuardians: true,
          notifyByEmail: false,
        },
      },
    );

    const lessonEvent = await prisma.lessonEvent.findFirst({
      where: {
        tenantId: tenant.id,
        lessonCalendarItemId: targetLessonItem.id,
        title: uniqueTitle,
        canceledAt: null,
      },
      orderBy: [{ createdAt: "desc" }],
    });
    assert(lessonEvent, "O evento de prova não foi persistido.");

    await requestJson(
      baseUrl,
      "PUT",
      `/api/v1/lesson-assessments/by-event/${lessonEvent.id}`,
      {
        token: teacherSession.token,
        body: {
          title: uniqueTitle,
          description: "NOTAS PARA TESTE DE VISIBILIDADE",
          maxScore: "10",
          notifyStudents: true,
          notifyGuardians: true,
          notifyByEmail: false,
          grades: [
            { studentId: studentA.id, score: "9.1", remarks: "NOTA ALUNO A" },
            { studentId: studentB.id, score: "6.4", remarks: "NOTA ALUNO B" },
          ],
        },
      },
    );

    const assessment = await prisma.lessonAssessment.findFirst({
      where: {
        tenantId: tenant.id,
        lessonEventId: lessonEvent.id,
        canceledAt: null,
      },
    });
    assert(assessment, "A avaliação da prova não foi persistida.");

    console.log("[TCHA VISIBILITY] Validando visibilidade por perfil...");
    const studentSummaryA = await requestJson<any>(
      baseUrl,
      "GET",
      "/api/v1/students/me/pwa-summary",
      {
        token: studentSessionA.token,
      },
    );
    const studentSummaryB = await requestJson<any>(
      baseUrl,
      "GET",
      "/api/v1/students/me/pwa-summary",
      {
        token: studentSessionB.token,
      },
    );
    const guardianSummaryA = await requestJson<any>(
      baseUrl,
      "GET",
      "/api/v1/guardians/me/pwa-summary",
      {
        token: guardianSessionA.token,
      },
    );
    const guardianSummaryB = await requestJson<any>(
      baseUrl,
      "GET",
      "/api/v1/guardians/me/pwa-summary",
      {
        token: guardianSessionB.token,
      },
    );

    const studentGradeA = findAssessmentInSummary(studentSummaryA, uniqueTitle);
    const studentGradeB = findAssessmentInSummary(studentSummaryB, uniqueTitle);
    const guardianStudentA = guardianSummaryA?.students?.[0]?.student;
    const guardianStudentB = guardianSummaryB?.students?.[0]?.student;
    const guardianGradeA = findAssessmentInSummary(guardianStudentA, uniqueTitle);
    const guardianGradeB = findAssessmentInSummary(guardianStudentB, uniqueTitle);

    assert(studentGradeA?.score === 9.1, "Aluno A não recebeu sua própria nota.");
    assert(studentGradeB?.score === 6.4, "Aluno B não recebeu sua própria nota.");
    assert(guardianSummaryA?.students?.length === 1, "Responsável A recebeu alunos indevidos.");
    assert(guardianSummaryB?.students?.length === 1, "Responsável B recebeu alunos indevidos.");
    assert(
      guardianStudentA?.student?.id === studentA.id,
      "Responsável A não ficou restrito ao aluno correto.",
    );
    assert(
      guardianStudentB?.student?.id === studentB.id,
      "Responsável B não ficou restrito ao aluno correto.",
    );
    assert(
      guardianGradeA?.score === 9.1,
      "Responsável A não recebeu a nota do seu aluno.",
    );
    assert(
      guardianGradeB?.score === 6.4,
      "Responsável B não recebeu a nota do seu aluno.",
    );

    const studentNotificationsA = await requestJson<any[]>(
      baseUrl,
      "GET",
      "/api/v1/notifications/my?status=ALL",
      {
        token: studentSessionA.token,
      },
    );
    const studentNotificationsB = await requestJson<any[]>(
      baseUrl,
      "GET",
      "/api/v1/notifications/my?status=ALL",
      {
        token: studentSessionB.token,
      },
    );
    const guardianNotificationsA = await requestJson<any[]>(
      baseUrl,
      "GET",
      "/api/v1/notifications/my?status=ALL",
      {
        token: guardianSessionA.token,
      },
    );
    const guardianNotificationsB = await requestJson<any[]>(
      baseUrl,
      "GET",
      "/api/v1/notifications/my?status=ALL",
      {
        token: guardianSessionB.token,
      },
    );

    const studentAttendanceNotificationA = studentNotificationsA.find(
      (item) =>
        item.sourceType === "LESSON_ATTENDANCE" &&
        item.sourceId === targetLessonItem.id,
    );
    const studentAssessmentNotificationA = studentNotificationsA.find(
      (item) =>
        item.sourceType === "LESSON_ASSESSMENT" &&
        item.sourceId === assessment.id,
    );
    const guardianAttendanceNotificationA = guardianNotificationsA.find(
      (item) =>
        item.sourceType === "LESSON_ATTENDANCE" &&
        item.sourceId === targetLessonItem.id,
    );
    const guardianAttendanceNotificationB = guardianNotificationsB.find(
      (item) =>
        item.sourceType === "LESSON_ATTENDANCE" &&
        item.sourceId === targetLessonItem.id,
    );
    const guardianAssessmentNotificationA = guardianNotificationsA.find(
      (item) =>
        item.sourceType === "LESSON_ASSESSMENT" &&
        item.sourceId === assessment.id,
    );

    assert(studentAttendanceNotificationA, "Aluno A não recebeu notificação de chamada.");
    assert(studentAssessmentNotificationA, "Aluno A não recebeu notificação de nota.");
    assert(guardianAttendanceNotificationA, "Responsável A não recebeu notificação de chamada.");
    assert(guardianAttendanceNotificationB, "Responsável B não recebeu notificação de chamada.");
    assert(guardianAssessmentNotificationA, "Responsável A não recebeu notificação de nota.");
    assert(
      !String(studentAttendanceNotificationA.message || "").includes(studentB.name),
      "Aluno A recebeu mensagem contendo nome de outro aluno.",
    );
    assert(
      String(guardianAttendanceNotificationA.message || "").includes(studentA.name) &&
        !String(guardianAttendanceNotificationA.message || "").includes(studentB.name),
      "Responsável A recebeu mensagem de chamada com aluno indevido.",
    );
    assert(
      String(guardianAttendanceNotificationB.message || "").includes(studentB.name) &&
        !String(guardianAttendanceNotificationB.message || "").includes(studentA.name),
      "Responsável B recebeu mensagem de chamada com aluno indevido.",
    );

    await requestJson(
      baseUrl,
      "GET",
      `/api/v1/students/${studentB.id}`,
      {
        token: studentSessionA.token,
        expectedStatus: 403,
      },
    );
    await requestJson(
      baseUrl,
      "GET",
      `/api/v1/students/${studentB.id}`,
      {
        token: guardianSessionA.token,
        expectedStatus: 403,
      },
    );

    console.log(
      JSON.stringify(
        {
          status: "SUCCESS",
          tenantId: tenant.id,
          lessonDate: targetLessonItem.lessonDate.toISOString().slice(0, 10),
          lessonDateLabel: fmtDateOnly(
            targetLessonItem.lessonDate.toISOString().slice(0, 10),
          ),
          lessonItemId: targetLessonItem.id,
          lesson: {
            subjectName: targetLessonItem.teacherSubject.subject.name,
            seriesName: targetLessonItem.seriesClass.series.name,
            className: targetLessonItem.seriesClass.class.name,
            startTime: targetLessonItem.startTime,
            endTime: targetLessonItem.endTime,
          },
          proofTitle: uniqueTitle,
          validatedStudents: [
            {
              id: studentA.id,
              name: studentA.name,
              email: studentA.email,
              score: studentGradeA?.score,
            },
            {
              id: studentB.id,
              name: studentB.name,
              email: studentB.email,
              score: studentGradeB?.score,
            },
          ],
          validatedGuardians: [
            {
              id: guardianLinkA.guardian.id,
              name: guardianLinkA.guardian.name,
              email: guardianLinkA.guardian.email,
              studentId: guardianStudentA?.student?.id || null,
              studentName: guardianStudentA?.student?.name || null,
              score: guardianGradeA?.score || null,
            },
            {
              id: guardianLinkB.guardian.id,
              name: guardianLinkB.guardian.name,
              email: guardianLinkB.guardian.email,
              studentId: guardianStudentB?.student?.id || null,
              studentName: guardianStudentB?.student?.name || null,
              score: guardianGradeB?.score || null,
            },
          ],
          notifications: {
            studentAttendance: !!studentAttendanceNotificationA,
            studentAssessment: !!studentAssessmentNotificationA,
            guardianAttendanceA: !!guardianAttendanceNotificationA,
            guardianAttendanceB: !!guardianAttendanceNotificationB,
            guardianAssessmentA: !!guardianAssessmentNotificationA,
          },
          accessIsolation: {
            studentCannotReadOtherStudent: true,
            guardianCannotReadOtherStudent: true,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

main().catch((error) => {
  console.error("[TCHA VISIBILITY] Falha:", error);
  process.exitCode = 1;
});
