import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsMobilePhone, IsOptional, IsString } from "class-validator";

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMobilePhone('en-IN', { strictMode: false }, { message: 'Invalid Indian mobile number' })
  mobile?: string;
}
