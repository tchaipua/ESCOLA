import { Global, Module } from "@nestjs/common";
import { FinanceiroBrowserGuard } from "./financeiro-browser.guard";
import { FinanceiroCallbackAuthGuard } from "./financeiro-callback-auth.guard";
import { FinanceiroCallbackReplayService } from "./financeiro-callback-replay.service";
import { FinanceiroController } from "./financeiro.controller";
import { FinanceiroInternalClient } from "./financeiro-internal.client";
import { FinanceiroService } from "./financeiro.service";

@Global()
@Module({
  controllers: [FinanceiroController],
  providers: [
    FinanceiroService,
    FinanceiroInternalClient,
    FinanceiroBrowserGuard,
    FinanceiroCallbackReplayService,
    FinanceiroCallbackAuthGuard,
  ],
  exports: [
    FinanceiroService,
    FinanceiroCallbackAuthGuard,
    FinanceiroCallbackReplayService,
  ],
})
export class FinanceiroModule {}
