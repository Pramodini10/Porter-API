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

  // Trip Management (Driver-wise)
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Get('trips/management')
  getTripManagement() {
    return this.ownerService.getTripManagement();
  }

  // Approve withdrawal
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Post('withdrawals/:withdrawalId/approve')
  approveWithdrawal(@Param('withdrawalId') withdrawalId: string) {
    return this.ownerService.approveWithdrawal(withdrawalId);
  }

  // Reject withdrawal
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Post('withdrawals/:withdrawalId/reject')
  rejectWithdrawal(@Param('withdrawalId') withdrawalId: string) {
    return this.ownerService.rejectWithdrawal(withdrawalId);
  }

  // Admin Dashboard
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Get('dashboard/stats')
  async getDashboardStats() {
    return {
      status: true,
      data: await this.ownerService.getDashboardStats(),
    };
  }
}