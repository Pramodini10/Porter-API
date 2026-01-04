import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { OwnerService } from './owner.service';
import { OwnerJwtGuard } from 'src/master/owner-jwt.guard';

@ApiTags('Admin')
@Controller('owner')
export class OwnerController {
  constructor(private readonly ownerService: OwnerService) { }

  @Post('register')
  async register(@Body() createOwnerDto: CreateOwnerDto) {
    const owner = await this.ownerService.create(createOwnerDto);
    return {
      statusCode: 201,
      message: 'Owner registered successfully',
      data: owner,
    };
  }

  @Get('mobile/:mobile')
  async getOwnerByMobile(@Param('mobile') mobile: string) {
    const owner = await this.ownerService.findByMobile(mobile);
    return {
      statusCode: 200,
      message: 'Owner details fetched successfully',
      data: owner,
    };
  }

  // Drivers with withdrawal requests
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Get('drivers')
  getDrivers() {
    return this.ownerService.getAllDrivers();
  }

  // Driver full details
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Get('drivers/:id')
  getDriverById(@Param('id') driverId: string) {
    return this.ownerService.getDriverDetails(driverId);
  }

  // Customer Booking
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Get('bookings')
  getAllBookings() {
    return this.ownerService.getAllBookings();
  }

  // Booking/Trip for Driver
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Get('bookings/driver/:driverId')
  getBookingsByDriver(@Param('driverId') driverId: string) {
    return this.ownerService.getBookingsByDriver(driverId);
  }
  // Approve withdrawal
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Post('withdrawals/:driverId/approve')
  approveWithdrawal(@Param('driverId') driverId: string) {
    return this.ownerService.approveWithdrawal(driverId);
  }

  // Reject withdrawal
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Post('withdrawals/:driverId/reject')
  rejectWithdrawal(@Param('driverId') driverId: string) {
    return this.ownerService.rejectWithdrawal(driverId);
  }
}