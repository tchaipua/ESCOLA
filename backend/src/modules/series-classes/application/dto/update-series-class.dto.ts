import { PartialType } from "@nestjs/swagger";
import { CreateSeriesClassDto } from "./create-series-class.dto";

export class UpdateSeriesClassDto extends PartialType(CreateSeriesClassDto) {}
