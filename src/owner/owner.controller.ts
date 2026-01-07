import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { OwnerService } from './owner.service';
import { OwnerJwtGuard } from 'src/master/owner-jwt.guard';
import { UpdateProfileDto } from './dto/profile-update.dto';

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

  // All Drivers 
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

  // All Withdrawal Request 
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Get('/all-requests')
  getAllWithdrawals() {
    return this.ownerService.getAllWithdrawals();
  }

  // Approve withdrawal
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Patch(':id/approve')
  approveWithdrawal(@Param('id') withdrawalId: string) {
    return this.ownerService.approveWithdrawal(withdrawalId);
  }

  // Reject withdrawal
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Patch(':id/reject')
  rejectWithdrawal(@Param('id') withdrawalId: string) {
    return this.ownerService.rejectWithdrawal(withdrawalId);
  }

  // All Customers 
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Get('all-customers')
  getCustomers() {
    return this.ownerService.getAllCustomers();
  }

  // Admin Dashboard
  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Get('dashboard')
  async getAdminDashboard() {
    return {
      message: 'Admin dashboard data fetched successfully',
      data: await this.ownerService.getAdminDashboard(),
    };
  }

  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Get('profile')
  getProfile(@Req() req) {
    return this.ownerService.getProfile(req.owner.userId);
  }

  @ApiBearerAuth()
  @UseGuards(OwnerJwtGuard)
  @Put('profile/update')
  updateProfile(@Req() req, @Body() dto: UpdateProfileDto) {
    return this.ownerService.updateProfile(req.owner.userId, dto);
  }
  
}