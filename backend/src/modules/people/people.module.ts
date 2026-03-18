import { Module } from "@nestjs/common";
import { SharedProfilesModule } from "../shared-profiles/shared-profiles.module";
import { PeopleService } from "./application/services/people.service";
import { PeopleController } from "./infrastructure/controllers/people.controller";

@Module({
  imports: [SharedProfilesModule],
  controllers: [PeopleController],
  providers: [PeopleService],
  exports: [PeopleService],
})
export class PeopleModule {}
