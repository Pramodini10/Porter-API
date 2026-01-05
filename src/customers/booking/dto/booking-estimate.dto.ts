import { ApiProperty } from "@nestjs/swagger";
import { IsMobilePhone, IsNumber, IsOptional, IsString } from "class-validator";

export class BookingEstimateDto {
  @ApiProperty()
  @IsNumber()
  pickupLat: number;

  @ApiProperty()
  @IsNumber()
  pickupLng: number;

  @ApiProperty()
  @IsNumber()
  dropLat: number;

  @ApiProperty()
  @IsNumber()
  dropLng: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  receiverName?: string;

  @ApiProperty()
  @IsOptional()
  @IsMobilePhone('en-IN')
  receiverMobile?: string;
}
