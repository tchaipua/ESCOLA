import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentUser,
  type ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";
import { NotificationsService } from "../../application/services/notifications.service";
import { ListMyNotificationsDto } from "../../application/dto/list-my-notifications.dto";
import { MarkNotificationsReadDto } from "../../application/dto/mark-notifications-read.dto";

@ApiBearerAuth()
@ApiTags("Notificações")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("my")
  @ApiOperation({ summary: "Lista as notificações do usuário logado" })
  findMine(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() query: ListMyNotificationsDto,
  ) {
    return this.notificationsService.findMyNotifications(currentUser, query);
  }

  @Get("my/unread-summary")
  @ApiOperation({ summary: "Resumo de notificações não lidas do usuário logado" })
  unreadSummary(@CurrentUser() currentUser: ICurrentUser) {
    return this.notificationsService.getUnreadSummary(currentUser);
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Marca uma notificação como lida" })
  markAsRead(
    @Param("id") id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.notificationsService.markAsRead(id, currentUser);
  }

  @Post("my/read-all")
  @ApiOperation({ summary: "Marca todas as notificações como lidas" })
  markAllAsRead(@CurrentUser() currentUser: ICurrentUser) {
    return this.notificationsService.markAllAsRead(currentUser);
  }

  @Post("my/read-batch")
  @ApiOperation({ summary: "Marca em lote notificações específicas como lidas" })
  markBatchAsRead(
    @Body() markNotificationsReadDto: MarkNotificationsReadDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.notificationsService.markBatchAsRead(
      markNotificationsReadDto.ids,
      currentUser,
    );
  }
}
