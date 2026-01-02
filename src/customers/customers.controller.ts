import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { AuthService } from 'src/auth/auth.service';
import { CustomerGuard } from './customer.guard';
import { CustomersService } from './customers.service';
import { UpdateProfileDto } from './dto/profile-update.dto';

@ApiTags('Customers')
@Controller('customer')
export class CustomersController {
  constructor(private readonly authService: AuthService,
    private readonly customersService: CustomersService) { }

  // 1️⃣ Register Customer (temporarily store data for OTP)
  @Post('register')
  async register(@Body() dto: CreateCustomerDto) {
    return this.customersService.registerCustomer(dto);
  }

  @ApiBearerAuth()
  @UseGuards(CustomerGuard)
  @Get('dashboard')
  async dashboard(@Req() req) {
    return this.customersService.getDashboard(req.customerId);
  }

  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @Get('profile')
  getProfile(@Req() req) {
    return this.customersService.getProfile(req.customerId);
  }

  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @Put('profile/update')
  updateProfile(@Req() req, @Body() dto: UpdateProfileDto) {
    return this.customersService.updateProfile(req.customerId, dto);
  }

  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @Post('profile/logout')
  logout() {
    return {
      message: 'Logged out successfully',
    };
  }
}
