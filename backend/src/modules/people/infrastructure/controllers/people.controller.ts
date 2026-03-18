import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../../common/decorators/roles.decorator";
import {
  CurrentUser,
  type ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";
import { PeopleService } from "../../application/services/people.service";
import { CreatePersonDto } from "../../application/dto/create-person.dto";
import { UpdatePersonDto } from "../../application/dto/update-person.dto";

@ApiBearerAuth()
@ApiTags("Pessoas")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("people")
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get()
  @ApiOperation({
    summary:
      "Lista o cadastro mestre de pessoas e os papéis vinculados na escola",
  })
  findAll() {
    return this.peopleService.findAll();
  }

  @Get(":id")
  @ApiOperation({
    summary: "Consulta uma pessoa com os papéis vinculados",
  })
  findOne(@Param("id") id: string) {
    return this.peopleService.findOne(id);
  }

  @Post()
  @ApiOperation({
    summary:
      "Cria uma pessoa e opcionalmente já a vincula como professor, aluno e/ou responsável",
  })
  create(
    @Body() createPersonDto: CreatePersonDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.peopleService.create(createPersonDto, currentUser);
  }

  @Patch(":id")
  @ApiOperation({
    summary:
      "Atualiza a pessoa e cria/atualiza os papéis informados sem duplicar o cadastro básico",
  })
  update(
    @Param("id") id: string,
    @Body() updatePersonDto: UpdatePersonDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.peopleService.update(id, updatePersonDto, currentUser);
  }
}
