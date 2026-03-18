import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { SchoolYearsModule } from "./modules/school-years/school-years.module";
import { SeriesModule } from "./modules/series/series.module";
import { ClassesModule } from "./modules/classes/classes.module";
import { SeriesClassesModule } from "./modules/series-classes/series-classes.module";
import { StudentsModule } from "./modules/students/students.module";
import { GuardiansModule } from "./modules/guardians/guardians.module";
import { EnrollmentsModule } from "./modules/enrollments/enrollments.module";
import { TeachersModule } from "./modules/teachers/teachers.module";
import { SubjectsModule } from "./modules/subjects/subjects.module";
import { TeacherSubjectsModule } from "./modules/teacher-subjects/teacher-subjects.module";
import { SchedulesModule } from "./modules/schedules/schedules.module";
import { ClassScheduleItemsModule } from "./modules/class-schedule-items/class-schedule-items.module";
import { LessonCalendarsModule } from "./modules/lesson-calendars/lesson-calendars.module";
import { SharedProfilesModule } from "./modules/shared-profiles/shared-profiles.module";
import { UserPreferencesModule } from "./modules/user-preferences/user-preferences.module";
import { GlobalSettingsModule } from "./modules/global-settings/global-settings.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { LessonEventsModule } from "./modules/lesson-events/lesson-events.module";
import { LessonAssessmentsModule } from "./modules/lesson-assessments/lesson-assessments.module";
import { CommunicationsModule } from "./modules/communications/communications.module";
import { PeopleModule } from "./modules/people/people.module";

import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { ExcludePasswordInterceptor } from "./common/interceptors/exclude-password.interceptor";
import { TenantMiddleware } from "./common/tenant/tenant.middleware";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    SchoolYearsModule, // Modulo letivo ativado mundialmente
    SeriesModule,
    ClassesModule,
    SeriesClassesModule,
    StudentsModule, // O prato principal
    GuardiansModule, // O modulo PWA de Pais
    EnrollmentsModule, // Fecha o loop mestre!
    TeachersModule, // F-PR
    SubjectsModule, // MA
    TeacherSubjectsModule, // PM (O Vínculo de Grade)
    SchedulesModule, // O Calendário Supremo!
    ClassScheduleItemsModule, // Grade Horária Planejada
    LessonCalendarsModule, // Grade Anual
    SharedProfilesModule,
    PeopleModule,
    UserPreferencesModule,
    GlobalSettingsModule,
    NotificationsModule,
    LessonEventsModule,
    LessonAssessmentsModule,
    CommunicationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ExcludePasswordInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
