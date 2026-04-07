import { Injectable } from "@nestjs/common";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import { FinanceiroService } from "../../../../integrations/financeiro/financeiro.service";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  CloseCashSessionDto,
  ListCashierInstallmentsDto,
  ListOpenCashierInstallmentsDto,
  OpenCashSessionDto,
  SettleCashInstallmentDto,
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
}
