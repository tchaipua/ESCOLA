import { Injectable } from "@nestjs/common";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import { deserializePermissions } from "../../../../common/auth/user-permissions";
import { FinanceiroService } from "../../../../integrations/financeiro/financeiro.service";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  CloseCashSessionDto,
  ListCashierInstallmentsDto,
  ListOpenCashierInstallmentsDto,
  OpenCashSessionDto,
  SettleCashInstallmentDto,
  UpdateCashierInstallmentDto,
} from "../dto/cashier.dto";

@Injectable()
export class FinancialCashierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeiroService: FinanceiroService,
  ) {}

  private financeFilters(currentUser: ICurrentUser) {
    return {
      sourceSystem: "ESCOLA",
      sourceTenantId: currentUser.tenantId,
    };
  }

  private normalizeText(value: string) {
    return String(value || "").trim().toUpperCase();
  }

  private async resolveOperatorIdentity(currentUser: ICurrentUser) {
    if (currentUser.isMaster) {
      return {
        userId: currentUser.userId,
        displayName: "MSINFOR MASTER",
      };
    }

    const baseWhere = {
      id: currentUser.userId,
      tenantId: currentUser.tenantId,
      canceledAt: null,
    };

    const record =
      currentUser.modelType === "teacher"
        ? await this.prisma.teacher.findFirst({
            where: baseWhere,
            select: { name: true },
          })
        : currentUser.modelType === "student"
          ? await this.prisma.student.findFirst({
              where: baseWhere,
              select: { name: true },
            })
          : currentUser.modelType === "guardian"
            ? await this.prisma.guardian.findFirst({
                where: baseWhere,
                select: { name: true },
              })
            : await this.prisma.user.findFirst({
                where: baseWhere,
                select: { name: true },
              });

    return {
      userId: currentUser.userId,
      displayName:
        String(record?.name || currentUser.email || currentUser.userId)
          .trim()
          .toUpperCase() || currentUser.userId,
    };
  }

  private async notifyAdminInstallmentChange(args: {
    currentUser: ICurrentUser;
    installment: {
      id: string;
      sourceEntityName?: string | null;
      payerNameSnapshot?: string | null;
      installmentNumber?: number | null;
      installmentCount?: number | null;
      dueDate: string;
      amount: number;
    };
    previousDueDate?: string | null;
    previousAmount?: number | null;
  }) {
    const dueDateChanged =
      Boolean(args.previousDueDate) &&
      String(args.previousDueDate) !== String(args.installment.dueDate);
    const amountChanged =
      typeof args.previousAmount === "number" &&
      Number(args.previousAmount) !== Number(args.installment.amount);

    if (!dueDateChanged && !amountChanged) {
      return;
    }

    const tenantUsers = await this.prisma.user.findMany({
      where: {
        tenantId: args.currentUser.tenantId,
        canceledAt: null,
      },
      select: {
        id: true,
        role: true,
        permissions: true,
      },
    });

    const adminRecipients = tenantUsers.filter((user) => {
      const permissions = deserializePermissions(user.permissions, user.role);
      return user.role === "ADMIN" || permissions.includes("MANAGE_MONTHLY_FEES");
    });

    if (!adminRecipients.length) {
      return;
    }

    const details = [
      dueDateChanged
        ? `VENCIMENTO: ${String(args.previousDueDate || "").slice(0, 10)} -> ${String(args.installment.dueDate || "").slice(0, 10)}`
        : null,
      amountChanged
        ? `VALOR: ${Number(args.previousAmount || 0).toFixed(2)} -> ${Number(args.installment.amount || 0).toFixed(2)}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");

    await this.prisma.notification.createMany({
      data: adminRecipients.map((recipient) => ({
        tenantId: args.currentUser.tenantId,
        recipientType: "USER",
        recipientId: recipient.id,
        category: "FINANCEIRO",
        title: this.normalizeText("ALTERAÇÃO DE PARCELA EM ABERTO"),
        message: this.normalizeText(
          `${args.installment.sourceEntityName || "PARCELA"} ${args.installment.installmentNumber || 0}/${args.installment.installmentCount || 0} FOI ALTERADA POR ${args.currentUser.email || args.currentUser.userId}. ${details}`,
        ),
        actionUrl: "/principal/parcelas",
        sourceType: "FINANCIAL_INSTALLMENT",
        sourceId: args.installment.id,
        metadata: JSON.stringify({
          payerNameSnapshot: args.installment.payerNameSnapshot || null,
          previousDueDate: args.previousDueDate || null,
          currentDueDate: args.installment.dueDate,
          previousAmount: args.previousAmount ?? null,
          currentAmount: args.installment.amount,
          changedBy: args.currentUser.userId,
        }),
        createdBy: args.currentUser.userId,
        updatedBy: args.currentUser.userId,
      })),
    });
  }

  async getCurrentSession(currentUser: ICurrentUser) {
    return this.financeiroService.getCurrentCashSession({
      ...this.financeFilters(currentUser),
      cashierUserId: currentUser.userId,
    });
  }

  async openSession(currentUser: ICurrentUser, payload: OpenCashSessionDto) {
    const operator = await this.resolveOperatorIdentity(currentUser);

    return this.financeiroService.openCashSession({
      requestedBy: currentUser.userId,
      ...this.financeFilters(currentUser),
      cashierUserId: operator.userId,
      cashierDisplayName: operator.displayName,
      openingAmount: payload.openingAmount,
      notes: payload.notes,
    });
  }

  async closeSession(currentUser: ICurrentUser, payload: CloseCashSessionDto) {
    return this.financeiroService.closeCurrentCashSession({
      requestedBy: currentUser.userId,
      ...this.financeFilters(currentUser),
      cashierUserId: currentUser.userId,
      declaredClosingAmount: payload.declaredClosingAmount,
      closedAt: payload.closedAt,
      notes: payload.notes,
    });
  }

  async listInstallments(
    currentUser: ICurrentUser,
    query: ListCashierInstallmentsDto,
  ) {
    return this.financeiroService.listInstallments({
      ...this.financeFilters(currentUser),
      status: query.status,
      studentName: query.studentName,
      payerName: query.payerName,
      search: query.search,
    });
  }

  async listOpenInstallments(
    currentUser: ICurrentUser,
    query: ListOpenCashierInstallmentsDto,
  ) {
    return this.listInstallments(currentUser, {
      ...query,
      status: "OPEN",
    });
  }

  async settleCashInstallment(
    currentUser: ICurrentUser,
    installmentId: string,
    payload: SettleCashInstallmentDto,
  ) {
    const operator = await this.resolveOperatorIdentity(currentUser);

    return this.financeiroService.settleCashInstallment(installmentId, {
      requestedBy: currentUser.userId,
      ...this.financeFilters(currentUser),
      cashierUserId: operator.userId,
      cashierDisplayName: operator.displayName,
      receivedAt: payload.receivedAt,
      discountAmount: payload.discountAmount,
      interestAmount: payload.interestAmount,
      penaltyAmount: payload.penaltyAmount,
      notes: payload.notes,
    });
  }

  async updateInstallment(
    currentUser: ICurrentUser,
    installmentId: string,
    payload: UpdateCashierInstallmentDto,
  ) {
    const installments = await this.financeiroService.listInstallments({
      ...this.financeFilters(currentUser),
      status: "ALL",
    });

    const previousInstallment = installments.find(
      (item) => item.id === installmentId,
    );

    const updatedInstallment = await this.financeiroService.updateInstallment(
      installmentId,
      {
        requestedBy: currentUser.userId,
        ...this.financeFilters(currentUser),
        dueDate: payload.dueDate,
        amount: payload.amount,
      },
    );

    await this.notifyAdminInstallmentChange({
      currentUser,
      installment: updatedInstallment,
      previousDueDate: previousInstallment?.dueDate || null,
      previousAmount:
        previousInstallment && typeof previousInstallment.amount === "number"
          ? previousInstallment.amount
          : null,
    });

    return updatedInstallment;
  }
}
