import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  getTenantContext,
  tenantContext,
} from "../../../../common/tenant/tenant.context";
import { DEFAULT_BRANCH_CODE } from "../../../../common/tenant/branch.constants";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: {
      id?: number | string;
    };
    from?: {
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: {
      chat?: {
        id?: number | string;
      };
    };
    from?: {
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
};

type TelegramConfiguration = {
  tenantId: string;
  tenantName: string;
  token: string;
  username: string | null;
  headerImageUrl: string | null;
};

type TelegramPersonMatch = {
  id: string;
  name: string;
  telegramChatId: string | null;
};

type TelegramReplyMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

type TelegramStudentOption = {
  id: string;
  name: string;
  seriesClassLabel: string | null;
};

type TelegramStudentIntent =
  | "MENU"
  | "BOLETIM"
  | "NOTAS"
  | "FREQUENCIA"
  | "CALENDARIO"
  | "AULAS"
  | "DIA";

type TelegramStudentCommand = {
  intent: TelegramStudentIntent;
  date?: string;
  endDate?: string;
};

type PendingTelegramAction = {
  intent: "AULAS";
  studentId: string;
  date?: string;
  endDate?: string;
};

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private pollingTimer: NodeJS.Timeout | null = null;
  private readonly updateOffsets = new Map<string, number>();
  private readonly pendingActions = new Map<string, PendingTelegramAction>();
  private pollingInProgress = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.TELEGRAM_POLLING_ENABLED === "false") {
      return;
    }

    this.pollingTimer = setInterval(() => {
      void this.pollAllTenantUpdates().catch(() => undefined);
    }, 5000);
  }

  onModuleDestroy() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private tenantId() {
    return getTenantContext()?.tenantId;
  }

  private userId() {
    return getTenantContext()?.userId || undefined;
  }

  private onlyDigits(value?: string | null) {
    return String(value || "").replace(/\D/g, "");
  }

  private normalizeUsername(value?: string | null) {
    const text = String(value || "").trim().replace(/^@+/, "");
    return text ? `@${text.toUpperCase()}` : null;
  }

  private appendDebugLog(event: string, payload: Record<string, unknown>) {
    const logPath = path.resolve(process.cwd(), "telegram-debug.log");
    const entry = {
      at: new Date().toISOString(),
      event,
      ...payload,
    };
    fs.appendFile(logPath, `${JSON.stringify(entry)}\n`, () => undefined);
  }

  private buildWebhookSecret(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex").slice(0, 40);
  }

  private getPublicApiBaseUrl() {
    return (
      process.env.BACKEND_PUBLIC_URL ||
      process.env.PUBLIC_API_URL ||
      process.env.API_PUBLIC_URL ||
      "http://localhost:3001/api/v1"
    ).replace(/\/$/, "");
  }

  private async telegramFetch(url: string, init?: RequestInit, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private isGreeting(text: string) {
    return ["OI", "OLA", "OLÁ", "START", "/START", "COMEÇAR", "INICIAR"].includes(
      text.trim().toUpperCase(),
    );
  }

  private isOptOut(text: string) {
    return ["SAIR", "PARAR", "CANCELAR", "STOP"].includes(
      text.trim().toUpperCase(),
    );
  }

  private normalizeCommand(text: string): TelegramStudentCommand | null {
    const normalized = text
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\//, "");

    const dayMatch = normalized.match(/^DIA\s+(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dayMatch) {
      return {
        intent: "DIA",
        date: this.parseBrazilianDateParts(dayMatch[1], dayMatch[2], dayMatch[3]),
      };
    }

    const classesText = normalized.replace(/^AULAS?\s+/, "");
    const classesPeriod = this.parseBrazilianDatePeriod(classesText);
    if (/^AULAS?\s+/.test(normalized) && classesPeriod) {
      return {
        intent: "AULAS",
        date: classesPeriod.date,
        endDate: classesPeriod.endDate,
      };
    }

    if (["MENU", "OPCOES", "OPCOES"].includes(normalized)) {
      return { intent: "MENU" };
    }
    if (["BOLETIM"].includes(normalized)) {
      return { intent: "BOLETIM" };
    }
    if (["NOTA", "NOTAS"].includes(normalized)) {
      return { intent: "NOTAS" };
    }
    if (["FREQUENCIA", "FREQUENCIAS", "FALTA", "FALTAS"].includes(normalized)) {
      return { intent: "FREQUENCIA" };
    }
    if (["CALENDARIO", "CALENDÁRIO", "PROVA", "PROVAS", "TRABALHO", "TRABALHOS"].includes(normalized)) {
      return { intent: "CALENDARIO" };
    }
    if (["AULA", "AULAS"].includes(normalized)) {
      return { intent: "AULAS" };
    }
    return null;
  }

  private isValidCpf(cpf: string) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
    const calcDigit = (size: number) => {
      let sum = 0;
      for (let index = 0; index < size; index += 1) {
        sum += Number(cpf[index]) * (size + 1 - index);
      }
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10]);
  }

  private isValidCnpj(cnpj: string) {
    if (!/^\d{14}$/.test(cnpj) || /^(\d)\1+$/.test(cnpj)) return false;
    const calcDigit = (size: number) => {
      const weights =
        size === 12
          ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
          : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const sum = weights.reduce(
        (total, weight, index) => total + Number(cnpj[index]) * weight,
        0,
      );
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    };
    return (
      calcDigit(12) === Number(cnpj[12]) &&
      calcDigit(13) === Number(cnpj[13])
    );
  }

  private async getTenantTelegramConfiguration(
    tenantId: string,
  ): Promise<TelegramConfiguration | null> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, canceledAt: null },
      select: {
        id: true,
        name: true,
        telegramEnabled: true,
        telegramBotToken: true,
        telegramBotUsername: true,
      },
    });

    if (!tenant) return null;

    const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
    const token = tenant.telegramBotToken?.trim() || envToken;
    if (!token || (!tenant.telegramEnabled && !envToken)) {
      return null;
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      token,
      username:
        tenant.telegramBotUsername?.trim() ||
        process.env.TELEGRAM_BOT_USERNAME ||
        null,
      headerImageUrl: await this.findTelegramHeaderImageUrl(tenant.id),
    };
  }

  private async findTelegramHeaderImageUrl(tenantId: string) {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ telegramHeaderImageUrl: string | null }>
    >(
      `
        SELECT telegramHeaderImageUrl
        FROM tenant_branches
        WHERE tenantId = ?
          AND canceledAt IS NULL
          AND telegramHeaderImageUrl IS NOT NULL
          AND telegramHeaderImageUrl <> ''
        ORDER BY branchCode ASC
        LIMIT 1
      `,
      tenantId,
    );

    return rows[0]?.telegramHeaderImageUrl || null;
  }

  private async sendTelegramMessage(
    configuration: TelegramConfiguration,
    chatId: string,
    text: string,
    replyMarkup?: TelegramReplyMarkup,
    parseMode?: "HTML",
  ) {
    const response = await this.telegramFetch(
      `https://api.telegram.org/bot${configuration.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...(parseMode ? { parse_mode: parseMode } : {}),
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      this.appendDebugLog("SEND_MESSAGE_FAILED", {
        tenantId: configuration.tenantId,
        chatId,
        status: response.status,
        body,
      });
      throw new BadRequestException(
        `Telegram não aceitou o envio da mensagem. ${body}`,
      );
    }

    this.appendDebugLog("SEND_MESSAGE_OK", {
      tenantId: configuration.tenantId,
      chatId,
      text,
    });
  }

  private buildTelegramImageBlob(imageUrl: string) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) return null;
    return new Blob([Buffer.from(match[2], "base64")], { type: match[1] });
  }

  private async sendTelegramPhoto(
    configuration: TelegramConfiguration,
    chatId: string,
    caption: string,
    imageUrl: string,
    replyMarkup?: TelegramReplyMarkup,
  ) {
    const imageBlob = this.buildTelegramImageBlob(imageUrl);
    if (!imageBlob) {
      await this.sendTelegramMessage(configuration, chatId, caption, replyMarkup);
      return;
    }

    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append("photo", imageBlob, "telegram-header.jpg");
    if (replyMarkup) {
      form.append("reply_markup", JSON.stringify(replyMarkup));
    }

    const response = await this.telegramFetch(
      `https://api.telegram.org/bot${configuration.token}/sendPhoto`,
      { method: "POST", body: form },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      this.appendDebugLog("SEND_PHOTO_FAILED", {
        tenantId: configuration.tenantId,
        chatId,
        status: response.status,
        body,
      });
      await this.sendTelegramMessage(configuration, chatId, caption, replyMarkup);
      return;
    }

    this.appendDebugLog("SEND_PHOTO_OK", {
      tenantId: configuration.tenantId,
      chatId,
      caption,
    });
  }

  private async answerCallbackQuery(
    configuration: TelegramConfiguration,
    callbackQueryId: string,
  ) {
    await this.telegramFetch(
      `https://api.telegram.org/bot${configuration.token}/answerCallbackQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId }),
      },
      3000,
    ).catch(() => undefined);
  }

  private async syncPersonTelegramToRoles(params: {
    tenantId: string;
    personId: string;
    telegramChatId: string | null;
    telegramUsername: string | null;
    telegramOptInAt: Date | null;
    telegramOptOutAt: Date | null;
  }) {
    const roleData = {
      telegramChatId: params.telegramChatId,
      telegramUsername: params.telegramUsername,
      telegramOptInAt: params.telegramOptInAt,
      telegramOptOutAt: params.telegramOptOutAt,
      updatedBy: this.userId(),
    };

    await Promise.all([
      this.prisma.teacher.updateMany({
        where: { tenantId: params.tenantId, personId: params.personId },
        data: roleData,
      }),
      this.prisma.student.updateMany({
        where: { tenantId: params.tenantId, personId: params.personId },
        data: roleData,
      }),
      this.prisma.guardian.updateMany({
        where: { tenantId: params.tenantId, personId: params.personId },
        data: roleData,
      }),
    ]);
  }

  private async findPersonByDocument(
    tenantId: string,
    documentDigits: string,
    isCpf: boolean,
  ): Promise<TelegramPersonMatch | null> {
    if (isCpf) {
      const personByDigits = await this.prisma.person.findFirst({
        where: { tenantId, cpfDigits: documentDigits, canceledAt: null },
        select: {
          id: true,
          name: true,
          telegramChatId: true,
        },
      });
      if (personByDigits) return personByDigits;

      const personByMaskedCpf = (
        await this.prisma.person.findMany({
          where: { tenantId, cpf: { not: null }, canceledAt: null },
          select: {
            id: true,
            name: true,
            cpf: true,
            telegramChatId: true,
          },
        })
      ).find((candidate) => this.onlyDigits(candidate.cpf) === documentDigits);
      if (personByMaskedCpf) {
        return {
          id: personByMaskedCpf.id,
          name: personByMaskedCpf.name,
          telegramChatId: personByMaskedCpf.telegramChatId,
        };
      }
    } else {
      const personByCnpj = (
        await this.prisma.person.findMany({
          where: { tenantId, cnpj: { not: null }, canceledAt: null },
          select: {
            id: true,
            name: true,
            cnpj: true,
            telegramChatId: true,
          },
        })
      ).find((candidate) => this.onlyDigits(candidate.cnpj) === documentDigits);
      if (personByCnpj) {
        return {
          id: personByCnpj.id,
          name: personByCnpj.name,
          telegramChatId: personByCnpj.telegramChatId,
        };
      }
    }

    return null;
  }

  private formatScore(score?: number | null) {
    if (score === null || score === undefined) return "-";
    return Number(score).toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  private formatDate(value?: Date | null) {
    if (!value) return "-";
    return value.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  }

  private formatSchoolDate(value?: Date | null) {
    if (!value) return "-";
    const day = String(value.getUTCDate()).padStart(2, "0");
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${value.getUTCFullYear()}`;
  }

  private parseBrazilianDateParts(day: string, month: string, year: string) {
    return `${year}-${month}-${day}`;
  }

  private parseBrazilianDatePeriod(text: string) {
    const normalized = text
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const dates = normalized.match(/\d{2}\/\d{2}\/\d{4}/g);
    if (!dates?.length || dates.length > 2) return null;

    const toIso = (value: string) => {
      const [day, month, year] = value.split("/");
      return this.parseBrazilianDateParts(day, month, year);
    };

    return {
      date: toIso(dates[0]),
      endDate: dates[1] ? toIso(dates[1]) : toIso(dates[0]),
    };
  }

  private formatDateTimeForQuery(date: string) {
    return new Date(`${date}T00:00:00.000Z`);
  }

  private buildZebraClassRow(index: number, item: {
    startTime: string;
    endTime: string;
    subject: string;
    teacher: string;
    events: string[];
  }) {
    const isDark = index % 2 === 0;
    const stripe = isDark ? "■■■■■■■■■■■■■■■■■■" : "□□□□□□□□□□□□□□";
    const marker = isDark ? "■" : "□";
    const lines = [
      stripe,
      `${marker} ${item.startTime} às ${item.endTime} | ${item.subject}`,
      `Professor: ${item.teacher}`,
    ];

    for (const event of item.events) {
      lines.push(`🔴 ${event}`);
    }

    return lines.join("\n");
  }

  private escapeTelegramHtml(value?: string | null) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private truncateTableValue(value: string, maxLength: number) {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  private padTableValue(value: string, width: number) {
    const text = this.truncateTableValue(value, width);
    return text.padEnd(width, " ");
  }

  private buildClassScheduleTableBorder(
    left: string,
    middle: string,
    right: string,
    widths: number[],
  ) {
    return `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`;
  }

  private formatClassScheduleTableRow(params: {
    startTime: string;
    endTime: string;
    subject: string;
    teacher: string;
  }) {
    const widths = [13, 16, 18];
    return [
      `│ ${this.padTableValue(
        params.endTime ? `${params.startTime}-${params.endTime}` : params.startTime,
        widths[0],
      )} `,
      `${this.padTableValue(params.subject, widths[1])} `,
      `${this.padTableValue(params.teacher, widths[2])} │`,
    ].join("│ ");
  }

  private formatClassScheduleEventRow(eventText: string) {
    const contentWidth = 13 + 16 + 18 + 6;
    return `│ ${this.padTableValue(eventText, contentWidth)} │`;
  }

  private buildClassScheduleTable(lines: string[]) {
    const widths = [13, 16, 18];
    return [
      this.buildClassScheduleTableBorder("┌", "┬", "┐", widths),
      this.formatClassScheduleTableRow({
        startTime: "HORÁRIO",
        endTime: "",
        subject: "DISCIPLINA",
        teacher: "PROFESSOR",
      }),
      this.buildClassScheduleTableBorder("├", "┼", "┤", widths),
      ...lines,
      this.buildClassScheduleTableBorder("└", "┴", "┘", widths),
    ].join("\n");
  }

  private getStudentReportParseMode(intent: TelegramStudentIntent) {
    return intent === "AULAS" ? "HTML" : undefined;
  }

  private async findTelegramGuardianStudents(
    tenantId: string,
    chatId: string,
  ): Promise<TelegramStudentOption[]> {
    const person = await this.prisma.person.findFirst({
      where: {
        tenantId,
        telegramChatId: chatId,
        telegramOptInAt: { not: null },
        telegramOptOutAt: null,
        canceledAt: null,
      },
      select: {
        guardians: {
          where: { tenantId, canceledAt: null },
          select: { id: true },
        },
      },
    });

    const guardianIds = person?.guardians.map((guardian) => guardian.id) || [];
    if (!guardianIds.length) return [];

    const links = await this.prisma.guardianStudent.findMany({
      where: {
        tenantId,
        guardianId: { in: guardianIds },
        canceledAt: null,
        student: { tenantId, canceledAt: null },
      },
      include: {
        student: {
          include: {
            person: true,
            enrollments: {
              where: { tenantId, canceledAt: null, status: "ATIVO" },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                seriesClass: { include: { series: true, class: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const students = new Map<string, TelegramStudentOption>();
    for (const link of links) {
      const enrollment = link.student.enrollments[0];
      const seriesName = enrollment?.seriesClass?.series?.name;
      const className = enrollment?.seriesClass?.class?.name;
      students.set(link.student.id, {
        id: link.student.id,
        name: link.student.person?.name || "ALUNO",
        seriesClassLabel:
          seriesName || className
            ? [seriesName, className].filter(Boolean).join(" - ")
            : null,
      });
    }

    return Array.from(students.values()).sort((left, right) =>
      left.name.localeCompare(right.name, "pt-BR"),
    );
  }

  private buildStudentSelectionKeyboard(
    students: TelegramStudentOption[],
    intent: TelegramStudentIntent,
    date?: string,
    endDate?: string,
  ): TelegramReplyMarkup {
    return {
      inline_keyboard: students.map((student) => [
        {
          text: student.seriesClassLabel
            ? `${student.name} - ${student.seriesClassLabel}`
            : student.name,
          callback_data: ["STUDENT", intent, student.id, date, endDate]
            .filter(Boolean)
            .join(":"),
        },
      ]),
    };
  }

  private buildStudentOptionsKeyboard(studentId: string): TelegramReplyMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: "Boletim",
            callback_data: `STUDENT:BOLETIM:${studentId}`,
          },
        ],
        [
          {
            text: "Notas",
            callback_data: `STUDENT:NOTAS:${studentId}`,
          },
        ],
        [
          {
            text: "Frequência",
            callback_data: `STUDENT:FREQUENCIA:${studentId}`,
          },
        ],
        [
          {
            text: "Calendário de provas e trabalhos",
            callback_data: `STUDENT:CALENDARIO:${studentId}`,
          },
        ],
        [
          {
            text: "Calendário de aulas por data/período",
            callback_data: `STUDENT:AULAS:${studentId}`,
          },
        ],
      ],
    };
  }

  private async sendStudentMenu(params: {
    configuration: TelegramConfiguration;
    chatId: string;
    studentId: string;
    studentName: string;
  }) {
    const caption = `Aluno selecionado: ${params.studentName}\n\nEscolha uma opção abaixo.`;
    const keyboard = this.buildStudentOptionsKeyboard(params.studentId);

    if (params.configuration.headerImageUrl) {
      await this.sendTelegramPhoto(
        params.configuration,
        params.chatId,
        caption,
        params.configuration.headerImageUrl,
        keyboard,
      );
      return;
    }

    await this.sendTelegramMessage(
      params.configuration,
      params.chatId,
      caption,
      keyboard,
    );
  }

  private async ensureGuardianCanAccessStudent(params: {
    tenantId: string;
    chatId: string;
    studentId: string;
  }) {
    const students = await this.findTelegramGuardianStudents(
      params.tenantId,
      params.chatId,
    );
    return students.find((student) => student.id === params.studentId) || null;
  }

  private async buildStudentReportText(params: {
    tenantId: string;
    studentId: string;
    intent: TelegramStudentIntent;
    date?: string;
    endDate?: string;
  }) {
    const student = await this.prisma.student.findFirst({
      where: { id: params.studentId, tenantId: params.tenantId, canceledAt: null },
      include: { person: true },
    });
    if (!student) return "Aluno não localizado para este vínculo.";

    if (params.intent === "MENU") {
      return `Aluno selecionado: ${student.person?.name || "CADASTRO SEM NOME"}\n\nEscolha uma opção abaixo.`;
    }

    if (params.intent === "CALENDARIO") {
      return this.buildStudentCalendarText(params.tenantId, params.studentId);
    }

    if (params.intent === "DIA" && params.date) {
      return this.buildStudentDayText(params.tenantId, params.studentId, params.date);
    }

    if (params.intent === "AULAS" && params.date) {
      return this.buildStudentClassesPeriodText(
        params.tenantId,
        params.studentId,
        params.date,
        params.endDate || params.date,
      );
    }

    if (params.intent === "AULAS") {
      return "Informe a data ou período das aulas.\n\nExemplos:\n30/06/2026\n30/06/2026 05/07/2026";
    }

    const [grades, attendanceSummary] = await Promise.all([
      this.prisma.lessonAssessmentGrade.findMany({
        where: {
          tenantId: params.tenantId,
          studentId: params.studentId,
          canceledAt: null,
          score: { not: null },
          lessonAssessment: { canceledAt: null },
        },
        orderBy: { releasedAt: "desc" },
        take: 10,
        include: {
          lessonAssessment: {
            include: {
              lessonCalendarItem: {
                include: { teacherSubject: { include: { subject: true } } },
              },
            },
          },
        },
      }),
      this.prisma.lessonAttendance.groupBy({
        by: ["status"],
        where: {
          tenantId: params.tenantId,
          studentId: params.studentId,
          canceledAt: null,
        },
        _count: { status: true },
      }),
    ]);

    const totalAttendances = attendanceSummary.reduce(
      (total, item) => total + item._count.status,
      0,
    );
    const absences = attendanceSummary
      .filter((item) => item.status.toUpperCase() !== "PRESENTE")
      .reduce((total, item) => total + item._count.status, 0);
    const presences = totalAttendances - absences;
    const frequency =
      totalAttendances > 0 ? (presences / totalAttendances) * 100 : null;

    const lines = [
      `Aluno: ${student.person?.name || "ALUNO"}`,
      "",
    ];

    if (params.intent === "BOLETIM" || params.intent === "NOTAS") {
      lines.push("Notas lançadas:");
      if (!grades.length) {
        lines.push("Nenhuma nota lançada até o momento.");
      } else {
        for (const grade of grades) {
          const subject =
            grade.lessonAssessment.lessonCalendarItem.teacherSubject.subject
              ?.name || "DISCIPLINA";
          lines.push(
            `- ${subject}: ${this.formatScore(grade.score)} (${grade.lessonAssessment.title}) - ${this.formatDate(grade.releasedAt)}`,
          );
        }
      }
      lines.push("");
    }

    if (params.intent === "BOLETIM" || params.intent === "FREQUENCIA") {
      lines.push("Frequência:");
      if (!totalAttendances) {
        lines.push("Nenhuma chamada lançada até o momento.");
      } else {
        lines.push(`- Presenças: ${presences}`);
        lines.push(`- Faltas/ocorrências: ${absences}`);
        lines.push(`- Percentual: ${this.formatScore(frequency)}%`);
      }
    }

    return lines.join("\n").trim();
  }

  private async findActiveEnrollment(tenantId: string, studentId: string) {
    return this.prisma.enrollment.findFirst({
      where: { tenantId, studentId, canceledAt: null, status: "ATIVO" },
      orderBy: { createdAt: "desc" },
      include: { student: { include: { person: true } } },
    });
  }

  private async buildStudentCalendarText(tenantId: string, studentId: string) {
    const enrollment = await this.findActiveEnrollment(tenantId, studentId);
    if (!enrollment?.seriesClassId) {
      return "Não encontrei matrícula ativa para consultar o calendário deste aluno.";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const events = await this.prisma.lessonEvent.findMany({
      where: {
        tenantId,
        canceledAt: null,
        eventType: { in: ["PROVA", "TRABALHO"] },
        OR: [
          {
            lessonCalendarItem: {
              schoolYearId: enrollment.schoolYearId,
              seriesClassId: enrollment.seriesClassId,
              lessonDate: { gte: today },
            },
          },
          {
            schoolYearId: enrollment.schoolYearId,
            seriesClassId: enrollment.seriesClassId,
            eventDate: { gte: today },
          },
        ],
      },
      orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
      take: 10,
      include: {
        lessonCalendarItem: {
          include: { teacherSubject: { include: { subject: true } } },
        },
      },
    });

    const studentName = enrollment.student.person?.name || "CADASTRO SEM NOME";
    if (!events.length) {
      return `Calendário de ${studentName}\n\nNenhuma prova ou trabalho marcado a partir de hoje.`;
    }

    const lines = [`Calendário de ${studentName}`, ""];
    for (const event of events) {
      const date = event.eventDate || event.lessonCalendarItem?.lessonDate || null;
      const subject =
        event.subjectNameSnapshot ||
        event.lessonCalendarItem?.teacherSubject.subject?.name ||
        "DISCIPLINA";
      lines.push(`${this.formatDate(date)} - ${event.eventType}`);
      lines.push(`${subject}${event.title ? ` - ${event.title}` : ""}`);
      if (event.description) lines.push(`Detalhes: ${event.description}`);
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  private async buildStudentDayText(tenantId: string, studentId: string, date: string) {
    const enrollment = await this.findActiveEnrollment(tenantId, studentId);
    if (!enrollment?.seriesClassId) {
      return "Não encontrei matrícula ativa para consultar este dia.";
    }

    const dayStart = this.formatDateTimeForQuery(date);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const items = await this.prisma.lessonCalendarItem.findMany({
      where: {
        tenantId,
        canceledAt: null,
        schoolYearId: enrollment.schoolYearId,
        seriesClassId: enrollment.seriesClassId,
        lessonDate: { gte: dayStart, lt: dayEnd },
      },
      orderBy: [{ startTime: "asc" }],
      include: {
        teacherSubject: {
          include: {
            subject: true,
            teacher: { include: { person: true } },
          },
        },
        lessonEvents: {
          where: { canceledAt: null },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const studentName = enrollment.student.person?.name || "CADASTRO SEM NOME";
    const displayDate = this.formatSchoolDate(dayStart);
    if (!items.length) {
      return `Dia ${displayDate} - ${studentName}\n\nNenhuma aula encontrada para este aluno.`;
    }

    const lines = [`Dia ${displayDate} - ${studentName}`, ""];
    for (const item of items) {
      const subject = item.teacherSubject.subject?.name || "DISCIPLINA";
      const teacher = item.teacherSubject.teacher?.person?.name || "PROFESSOR";
      lines.push(`${item.startTime} às ${item.endTime} - ${subject}`);
      lines.push(`Professor: ${teacher}`);
      const events = item.lessonEvents.filter((event) =>
        ["PROVA", "TRABALHO"].includes(event.eventType),
      );
      for (const event of events) {
        lines.push(`${event.eventType}: ${event.title || event.description || "SEM DETALHES"}`);
      }
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  private async buildStudentClassesPeriodText(
    tenantId: string,
    studentId: string,
    startDate: string,
    endDate: string,
  ) {
    const enrollment = await this.findActiveEnrollment(tenantId, studentId);
    if (!enrollment?.seriesClassId) {
      return "Não encontrei matrícula ativa para consultar as aulas.";
    }

    const start = this.formatDateTimeForQuery(startDate);
    const end = this.formatDateTimeForQuery(endDate);
    if (end < start) {
      return "A data final precisa ser maior ou igual à data inicial.";
    }
    const exclusiveEnd = new Date(end);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);

    const items = await this.prisma.lessonCalendarItem.findMany({
      where: {
        tenantId,
        canceledAt: null,
        schoolYearId: enrollment.schoolYearId,
        seriesClassId: enrollment.seriesClassId,
        lessonDate: { gte: start, lt: exclusiveEnd },
      },
      orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }],
      include: {
        teacherSubject: {
          include: {
            subject: true,
            teacher: { include: { person: true } },
          },
        },
        lessonEvents: {
          where: { canceledAt: null },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const studentName = enrollment.student.person?.name || "CADASTRO SEM NOME";
    const periodLabel =
      startDate === endDate
        ? this.formatSchoolDate(start)
        : `${this.formatSchoolDate(start)} a ${this.formatSchoolDate(end)}`;

    if (!items.length) {
      return [
        "<b>📚 CALENDÁRIO DE AULAS</b>",
        `Aluno: ${this.escapeTelegramHtml(studentName)}`,
        `Período: ${this.escapeTelegramHtml(periodLabel)}`,
        "",
        "Nenhuma aula encontrada no período.",
        "",
        "= TERMINEI =",
      ].join("\n");
    }

    const itemsByDate = new Map<string, typeof items>();
    for (const item of items) {
      const itemDate = this.formatSchoolDate(item.lessonDate);
      const dayItems = itemsByDate.get(itemDate) || [];
      dayItems.push(item);
      itemsByDate.set(itemDate, dayItems);
    }

    const lines = [
      "<b>📚 CALENDÁRIO DE AULAS</b>",
      `Aluno: ${this.escapeTelegramHtml(studentName)}`,
      `Período: ${this.escapeTelegramHtml(periodLabel)}`,
      "",
    ];
    let totalClasses = 0;
    const cursor = new Date(start);

    while (cursor <= end) {
      const itemDate = this.formatSchoolDate(cursor);
      const dayItems = itemsByDate.get(itemDate) || [];
      lines.push(`<b>📅 ${this.escapeTelegramHtml(itemDate)}</b>`);

      if (!dayItems.length) {
        lines.push("Sem aulas cadastradas para este dia.");
        lines.push("");
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      const tableLines: string[] = [];

      for (const item of dayItems) {
        const subject = item.teacherSubject?.subject?.name || "INTERVALO";
        const teacher = item.teacherSubject?.teacher?.person?.name || "-";

        const events = item.lessonEvents.filter((event) =>
          ["PROVA", "TRABALHO"].includes(event.eventType),
        );
        tableLines.push(
          this.formatClassScheduleTableRow({
            startTime: item.startTime,
            endTime: item.endTime,
            subject,
            teacher,
          }),
        );
        for (const event of events) {
          tableLines.push(
            this.formatClassScheduleEventRow(
              `${event.eventType}: ${this.truncateTableValue(
                event.title || event.description || "SEM DETALHES",
                42,
              )}`,
            ),
          );
        }
        totalClasses += 1;
      }

      lines.push(
        `<pre>${this.escapeTelegramHtml(this.buildClassScheduleTable(tableLines))}</pre>`,
      );
      lines.push("");
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    lines.push(
      `<b>Total:</b> ${totalClasses} aula${totalClasses === 1 ? "" : "s"} no período.`,
    );
    lines.push("");
    lines.push("= TERMINEI =");

    return lines.join("\n").trim();
  }

  private async sendStudentOptionsOrReport(params: {
    tenantId: string;
    configuration: TelegramConfiguration;
    chatId: string;
    intent: TelegramStudentIntent;
    date?: string;
    endDate?: string;
  }) {
    const students = await this.findTelegramGuardianStudents(
      params.tenantId,
      params.chatId,
    );

    if (!students.length) {
      await this.sendTelegramMessage(
        params.configuration,
        params.chatId,
        "Não encontrei alunos vinculados ao seu cadastro de responsável. Procure a secretaria para conferir o vínculo.",
      );
      return { ok: true, action: "NO_LINKED_STUDENTS" };
    }

    if (students.length === 1) {
      if (params.intent === "MENU") {
        await this.sendStudentMenu({
          configuration: params.configuration,
          chatId: params.chatId,
          studentId: students[0].id,
          studentName: students[0].name,
        });
        return { ok: true, action: "SENT_STUDENT_MENU", studentId: students[0].id };
      }

      const reportText = await this.buildStudentReportText({
        tenantId: params.tenantId,
        studentId: students[0].id,
        intent: params.intent,
        date: params.date,
        endDate: params.endDate,
      });
      await this.sendTelegramMessage(
        params.configuration,
        params.chatId,
        reportText,
        undefined,
        this.getStudentReportParseMode(params.intent),
      );
      return { ok: true, action: "SENT_STUDENT_REPORT", studentId: students[0].id };
    }

    if (params.intent === "AULAS" && params.date) {
      this.pendingActions.set(`${params.tenantId}:${params.chatId}`, {
        intent: "AULAS",
        studentId: "",
        date: params.date,
        endDate: params.endDate || params.date,
      });
    }

    const keyboard = this.buildStudentSelectionKeyboard(
      students,
      params.intent,
      params.intent === "AULAS" && params.date ? undefined : params.date,
      params.intent === "AULAS" && params.date ? undefined : params.endDate,
    );
    if (params.configuration.headerImageUrl) {
      await this.sendTelegramPhoto(
        params.configuration,
        params.chatId,
        "CEC - selecione o aluno.",
        params.configuration.headerImageUrl,
        keyboard,
      );
    } else {
      await this.sendTelegramMessage(
        params.configuration,
        params.chatId,
        "Selecione o aluno para consultar:",
        keyboard,
      );
    }
    return { ok: true, action: "ASK_STUDENT_SELECTION" };
  }

  async configureWebhook() {
    const tenantId = this.tenantId();
    if (!tenantId) {
      throw new BadRequestException("Tenant não identificado.");
    }

    const configuration = await this.getTenantTelegramConfiguration(tenantId);
    if (!configuration) {
      throw new BadRequestException("Telegram não configurado para esta escola.");
    }

    const secret = this.buildWebhookSecret(configuration.token);
    const webhookUrl = `${this.getPublicApiBaseUrl()}/telegram/webhook/${tenantId}/${secret}`;
    const response = await this.telegramFetch(
      `https://api.telegram.org/bot${configuration.token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "callback_query"],
        }),
      },
    );
    const result = await response.json().catch(() => null);

    if (!response.ok || result?.ok === false) {
      throw new BadRequestException(
        result?.description || "Não foi possível configurar o webhook.",
      );
    }

    return {
      message: "Webhook do Telegram configurado com sucesso.",
      webhookUrl,
      botUsername: configuration.username,
      localOnly: webhookUrl.includes("localhost"),
    };
  }

  async getWebhookStatus() {
    const tenantId = this.tenantId();
    if (!tenantId) {
      throw new BadRequestException("Tenant não identificado.");
    }

    const configuration = await this.getTenantTelegramConfiguration(tenantId);
    if (!configuration) {
      throw new BadRequestException("Telegram não configurado para esta escola.");
    }

    const response = await this.telegramFetch(
      `https://api.telegram.org/bot${configuration.token}/getWebhookInfo`,
    );
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok === false) {
      throw new BadRequestException(
        result?.description || "Não foi possível consultar o webhook.",
      );
    }

    return result.result;
  }

  private async processUpdate(
    tenantId: string,
    configuration: TelegramConfiguration,
    update: TelegramUpdate,
  ) {
    if (update.callback_query) {
      const callbackId = String(update.callback_query.id || "").trim();
      const chatId = String(update.callback_query.message?.chat?.id || "").trim();
      const data = String(update.callback_query.data || "").trim();

      if (callbackId) {
        await this.answerCallbackQuery(configuration, callbackId);
      }

      const [, intent, studentId, date, endDate] = data.split(":");
      if (
        chatId &&
        studentId &&
        ["MENU", "BOLETIM", "NOTAS", "FREQUENCIA", "CALENDARIO", "AULAS", "DIA"].includes(intent)
      ) {
        const student = await this.ensureGuardianCanAccessStudent({
          tenantId,
          chatId,
          studentId,
        });

        if (!student) {
          await this.sendTelegramMessage(
            configuration,
            chatId,
            "Não foi possível confirmar seu vínculo com este aluno. Procure a secretaria.",
          );
          return { ok: true, action: "STUDENT_ACCESS_DENIED" };
        }

        if (intent === "MENU") {
          await this.sendStudentMenu({
            configuration,
            chatId,
            studentId,
            studentName: student.name,
          });
          return { ok: true, action: "SENT_STUDENT_MENU", studentId };
        }

        if (intent === "AULAS" && !date) {
          const pendingPeriod = this.pendingActions.get(`${tenantId}:${chatId}`);
          if (pendingPeriod?.intent === "AULAS" && pendingPeriod.date) {
            this.pendingActions.delete(`${tenantId}:${chatId}`);
            const reportText = await this.buildStudentReportText({
              tenantId,
              studentId,
              intent: "AULAS",
              date: pendingPeriod.date,
              endDate: pendingPeriod.endDate || pendingPeriod.date,
            });
            await this.sendTelegramMessage(
              configuration,
              chatId,
              reportText,
              undefined,
              this.getStudentReportParseMode("AULAS"),
            );
            return { ok: true, action: "SENT_STUDENT_CLASSES_PERIOD", studentId };
          }

          this.pendingActions.set(`${tenantId}:${chatId}`, {
            intent: "AULAS",
            studentId,
          });
          await this.sendTelegramMessage(
            configuration,
            chatId,
            `Aluno selecionado: ${student.name}\n\nInforme uma data ou período.\n\nExemplos:\n30/06/2026\n30/06/2026 a 05/07/2026`,
          );
          return { ok: true, action: "ASK_CLASSES_PERIOD", studentId };
        }

        const reportText = await this.buildStudentReportText({
          tenantId,
          studentId,
          intent: intent as TelegramStudentIntent,
          date,
          endDate,
        });
        await this.sendTelegramMessage(
          configuration,
          chatId,
          reportText,
          undefined,
          this.getStudentReportParseMode(intent as TelegramStudentIntent),
        );
        return { ok: true, action: "SENT_STUDENT_REPORT", studentId };
      }

      this.appendDebugLog("IGNORED_CALLBACK", { tenantId, data, chatId });
      return { ok: true, ignored: true };
    }

    const chatId = String(update.message?.chat?.id || "").trim();
    const text = String(update.message?.text || "").trim();
    const telegramUsername = this.normalizeUsername(update.message?.from?.username);

    if (!chatId || !text) {
      this.appendDebugLog("IGNORED_UPDATE", { tenantId, update });
      return { ok: true, ignored: true };
    }

    this.appendDebugLog("RECEIVED_MESSAGE", {
      tenantId,
      chatId,
      text,
      telegramUsername,
    });

    const existingPerson = await this.prisma.person.findFirst({
      where: {
        tenantId,
        telegramChatId: chatId,
        canceledAt: null,
      },
      select: { id: true, name: true },
    });

    if (this.isOptOut(text)) {
      if (existingPerson) {
        const now = new Date();
        await this.prisma.person.update({
          where: { id: existingPerson.id },
          data: {
            telegramOptInAt: null,
            telegramOptOutAt: now,
            updatedBy: existingPerson.id,
          },
        });
        await this.syncPersonTelegramToRoles({
          tenantId,
          personId: existingPerson.id,
          telegramChatId: chatId,
          telegramUsername,
          telegramOptInAt: null,
          telegramOptOutAt: now,
        });
      }
      await this.sendTelegramMessage(
        configuration,
        chatId,
        "Recebido. Seu Telegram foi desativado para notificações da escola.",
      );
      return { ok: true, action: "OPT_OUT" };
    }

    if (existingPerson) {
      const pendingAction = this.pendingActions.get(`${tenantId}:${chatId}`);
      if (pendingAction?.intent === "AULAS") {
        const normalizedDates = this.parseBrazilianDatePeriod(text);

        if (normalizedDates) {
          this.pendingActions.delete(`${tenantId}:${chatId}`);
          const reportText = await this.buildStudentReportText({
            tenantId,
            studentId: pendingAction.studentId,
            intent: "AULAS",
            date: normalizedDates.date,
            endDate: normalizedDates.endDate,
          });
          await this.sendTelegramMessage(
            configuration,
            chatId,
            reportText,
            undefined,
            this.getStudentReportParseMode("AULAS"),
          );
          return {
            ok: true,
            action: "SENT_STUDENT_CLASSES_PERIOD",
            studentId: pendingAction.studentId,
          };
        }

        await this.sendTelegramMessage(
          configuration,
          chatId,
          "Informe uma data válida no formato 30/06/2026 ou um período como 30/06/2026 a 05/07/2026.",
        );
        return { ok: true, action: "INVALID_CLASSES_PERIOD" };
      }

      const command = this.normalizeCommand(text);
      if (command) {
        return this.sendStudentOptionsOrReport({
          tenantId,
          configuration,
          chatId,
          intent: command.intent,
          date: command.date,
          endDate: command.endDate,
        });
      }

      return this.sendStudentOptionsOrReport({
        tenantId,
        configuration,
        chatId,
        intent: "MENU",
      });
    }

    if (this.isGreeting(text)) {
      await this.sendTelegramMessage(
        configuration,
        chatId,
        "Olá. Para liberar suas notificações, informe seu CPF ou CNPJ, usando apenas números.",
      );
      return { ok: true, action: "ASK_DOCUMENT" };
    }

    const documentDigits = this.onlyDigits(text);
    const isCpf = documentDigits.length === 11;
    const isCnpj = documentDigits.length === 14;

    if (!isCpf && !isCnpj) {
      await this.sendTelegramMessage(
        configuration,
        chatId,
        "Não consegui identificar o documento. Envie seu CPF ou CNPJ usando apenas números.",
      );
      return { ok: true, action: "INVALID_DOCUMENT_LENGTH" };
    }

    if (
      (isCpf && !this.isValidCpf(documentDigits)) ||
      (isCnpj && !this.isValidCnpj(documentDigits))
    ) {
      await this.sendTelegramMessage(
        configuration,
        chatId,
        "CPF/CNPJ inválido. Confira os números e envie novamente.",
      );
      return { ok: true, action: "INVALID_DOCUMENT" };
    }

    const person = await this.findPersonByDocument(tenantId, documentDigits, isCpf);

    if (!person) {
      await this.sendTelegramMessage(
        configuration,
        chatId,
        "CPF/CNPJ não localizado no cadastro da escola. Procure a secretaria para conferir seus dados.",
      );
      return { ok: true, action: "DOCUMENT_NOT_FOUND" };
    }

    if (person.telegramChatId && person.telegramChatId !== chatId) {
      await this.sendTelegramMessage(
        configuration,
        chatId,
        "Este cadastro já possui um Telegram vinculado. Procure a secretaria para alterar o vínculo.",
      );
      return { ok: true, action: "DOCUMENT_ALREADY_LINKED" };
    }

    const now = new Date();
    await this.prisma.person.update({
      where: { id: person.id },
      data: {
        telegramChatId: chatId,
        telegramUsername,
        telegramOptInAt: now,
        telegramOptOutAt: null,
        updatedBy: person.id,
      },
    });
    await this.syncPersonTelegramToRoles({
      tenantId,
      personId: person.id,
      telegramChatId: chatId,
      telegramUsername,
      telegramOptInAt: now,
      telegramOptOutAt: null,
    });

    await this.sendTelegramMessage(
      configuration,
      chatId,
      `Pronto, ${person.name}. Seu Telegram foi vinculado e está liberado para receber notificações da escola.`,
    );

    this.appendDebugLog("LINKED_PERSON", {
      tenantId,
      chatId,
      personId: person.id,
    });

    return { ok: true, action: "LINKED", personId: person.id };
  }

  private runWithTelegramTenantContext<T>(
    tenantId: string,
    operation: () => Promise<T>,
  ) {
    const currentContext = getTenantContext();
    if (currentContext?.tenantId === tenantId) {
      return operation();
    }

    return tenantContext.run(
      {
        tenantId,
        branchCode: DEFAULT_BRANCH_CODE,
        userId: "TELEGRAM_BOT",
        role: "TELEGRAM_BOT",
        isMaster: false,
      },
      operation,
    );
  }

  async pollAllTenantUpdates() {
    if (this.pollingInProgress) {
      return { ok: true, skipped: true };
    }

    this.pollingInProgress = true;
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: {
          canceledAt: null,
          OR: [
            { telegramEnabled: true, telegramBotToken: { not: null } },
            process.env.TELEGRAM_BOT_TOKEN
              ? { telegramBotToken: null }
              : { id: "__NO_ENV_TELEGRAM_TOKEN__" },
          ],
        },
        select: { id: true },
      });

      const results = [];
      for (const tenant of tenants) {
        results.push(
          await this.runWithTelegramTenantContext(tenant.id, () =>
            this.pollTenantUpdates(tenant.id),
          ),
        );
      }
      return { ok: true, results };
    } finally {
      this.pollingInProgress = false;
    }
  }

  async pollTenantUpdates(tenantId: string) {
    const configuration = await this.getTenantTelegramConfiguration(tenantId);
    if (!configuration) {
      return { tenantId, processed: 0 };
    }

    const offset = this.updateOffsets.get(tenantId);
    const params = new URLSearchParams({
      timeout: "1",
      allowed_updates: JSON.stringify(["message", "callback_query"]),
    });
    if (offset) {
      params.set("offset", String(offset));
    }

    const response = await this.telegramFetch(
      `https://api.telegram.org/bot${configuration.token}/getUpdates?${params.toString()}`,
      undefined,
      5000,
    );
    const data = await response.json().catch(() => null);

    if (!response.ok || data?.ok === false || !Array.isArray(data?.result)) {
      this.appendDebugLog("GET_UPDATES_FAILED", {
        tenantId,
        status: response.status,
        data,
      });
      return {
        tenantId,
        processed: 0,
        error: data?.description || "Não foi possível consultar updates.",
      };
    }

    let processed = 0;
    for (const update of data.result) {
      this.appendDebugLog("POLL_UPDATE", { tenantId, update });
      if (typeof update.update_id === "number") {
        this.updateOffsets.set(tenantId, update.update_id + 1);
      }
      await this.processUpdate(tenantId, configuration, update);
      processed += 1;
    }

    return { tenantId, processed };
  }

  async handleWebhook(tenantId: string, secret: string, update: TelegramUpdate) {
    const configuration = await this.getTenantTelegramConfiguration(tenantId);
    if (!configuration) {
      throw new NotFoundException("Telegram não configurado.");
    }

    if (secret !== this.buildWebhookSecret(configuration.token)) {
      throw new ForbiddenException("Webhook inválido.");
    }

    return this.runWithTelegramTenantContext(tenantId, () =>
      this.processUpdate(tenantId, configuration, update),
    );
  }
}
