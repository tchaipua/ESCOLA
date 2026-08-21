import { Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import { ServiceSupervisorClient } from "../financeiro/service-supervisor.client";

@Controller("central")
export class CentralRecoveryController {
  constructor(private readonly serviceSupervisor: ServiceSupervisorClient) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("recover-service")
  recoverService() {
    return this.serviceSupervisor.recoverCentral();
  }
}
