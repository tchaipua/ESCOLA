import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentUser,
  type ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";
import { NotificationsService } from "../../application/services/notifications.service";
import { ListMyNotificationsDto } from "../../application/dto/list-my-notifications.dto";
import { MarkNotificationsReadDto } from "../../application/dto/mark-notifications-read.dto";
import { NotificationChatService } from "../../application/services/notification-chat.service";
import { SendNotificationChatMessageDto } from "../../application/dto/send-notification-chat-message.dto";
import { AddNotificationChatParticipantDto } from "../../application/dto/add-notification-chat-participant.dto";

@ApiTags("Notificações")
@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationChatService: NotificationChatService,
  ) {}

  @Get(":id/chat")
  @ApiOperation({ summary: "Abre o chat privado de uma notificação" })
  getChat(@Param("id") id: string, @CurrentUser() currentUser: ICurrentUser) {
    return this.notificationChatService.getChat(id, currentUser);
  }

  @Get(":id/chat/candidates")
  @ApiOperation({ summary: "Pesquisa participantes para o chat" })
  searchChatCandidates(
    @Param("id") id: string,
    @Query("search") search: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.notificationChatService.searchCandidates(id, currentUser, search);
  }

  @Post(":id/chat/messages")
  @ApiOperation({ summary: "Envia uma mensagem no chat da notificação" })
  sendChatMessage(
    @Param("id") id: string,
    @Body() dto: SendNotificationChatMessageDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.notificationChatService.sendMessage(id, currentUser, dto.message);
  }

  @Post(":id/chat/participants")
  @ApiOperation({ summary: "Adiciona uma pessoa ao chat da notificação" })
  addChatParticipant(
    @Param("id") id: string,
    @Body() dto: AddNotificationChatParticipantDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.notificationChatService.addParticipant(
      id,
      currentUser,
      dto.participantType,
      dto.participantId,
    );
  }

  @Post(":id/chat/read")
  @ApiOperation({ summary: "Marca o chat da notificação como lido" })
  markChatRead(
    @Param("id") id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.notificationChatService.markRead(id, currentUser);
  }

  @Get("my")
  @ApiOperation({ summary: "Lista as notificações do usuário logado" })
  findMine(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() query: ListMyNotificationsDto,
  ) {
    return this.notificationsService.findMyNotifications(currentUser, query);
  }

  @Get("my/unread-summary")
  @ApiOperation({
    summary: "Resumo de notificações não lidas do usuário logado",
  })
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

  @Patch(":id/unread")
  @ApiOperation({ summary: "Marca uma notificação como não lida" })
  markAsUnread(
    @Param("id") id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.notificationsService.markAsUnread(id, currentUser);
  }

  @Patch(":id/remove-attendance")
  @ApiOperation({
    summary: "Exclui logicamente uma notificação de presença visualizada",
  })
  removeAttendanceNotification(
    @Param("id") id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.notificationsService.removeAttendanceNotification(
      id,
      currentUser,
    );
  }

  @Post("my/read-all")
  @ApiOperation({ summary: "Marca todas as notificações como lidas" })
  markAllAsRead(@CurrentUser() currentUser: ICurrentUser) {
    return this.notificationsService.markAllAsRead(currentUser);
  }

  @Post("my/read-batch")
  @ApiOperation({
    summary: "Marca em lote notificações específicas como lidas",
  })
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
