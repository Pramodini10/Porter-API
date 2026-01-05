import { Controller, Post, Body, UseGuards, Req, Get, Param } from '@nestjs/common';
import { BookingService } from './booking.service';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { CustomerGuard } from '../customer.guard';
import { RouteCheckDto } from './dto/route-check.dto';
import { SelectVehicleDto } from './dto/select-vehicle.dto';
import { BookingEstimateDto } from './dto/booking-estimate.dto';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) { }

  @ApiBearerAuth()
  @UseGuards(CustomerGuard)
  @Post('route-check')
  @ApiOperation({ summary: 'Check route distance and duration' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        distanceKm: 12.5,
        durationMin: 35,
      },
    },
  })
  routeCheck(@Body() dto: RouteCheckDto) {
    return this.bookingService.routeCheck(dto);
  }

  @ApiBearerAuth()
  @UseGuards(CustomerGuard)
  @Post('estimate')
  @ApiOperation({ summary: 'Get fare estimate before booking' })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        distanceKm: 31.059,
        durationMin: 53,
        vehicles: [
          {
            vehicleType: 'Bike',
            estimatedFare: 170,
            etaMin: 53,
          },
          {
            vehicleType: 'MiniTruck',
            estimatedFare: 420,
            etaMin: 53,
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 400,
    schema: {
      example: {
        statusCode: 400,
        message: 'Pricing not available',
      },
    },
  })
  getEstimate(@Body() dto: BookingEstimateDto) {
    return this.bookingService.getEstimate(dto);
  }

  @ApiBearerAuth()
  @UseGuards(CustomerGuard)
  @Post('create')
  @ApiOperation({ summary: 'Create booking after vehicle selection' })
  @ApiResponse({
    status: 201,
    description: 'Booking created successfully',
    schema: {
      example: {
        message: 'Booking created',
        bookingId: '665f0c12a9d8e5f123456789',
        estimatedFare: 180,
        distanceKm: 12.5,
        durationMin: 35,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid route or vehicle',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid pickup/drop location',
      },
    },
  })
  create(@Req() req, @Body() dto: SelectVehicleDto) {
    return this.bookingService.createBooking(req.customerId, dto,);
  }

  @ApiBearerAuth()
  @UseGuards(CustomerGuard)
  @Get('current')
  @ApiOperation({ summary: 'Get current active booking' })
  getCurrentBooking(@Req() req) {
    return this.bookingService.getCurrentBooking(req.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(CustomerGuard)
  @Get('current/status')
  getCurrentBookingStatus(@Req() req) {
    return this.bookingService.getCurrentBookingStatus(req.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(CustomerGuard)
  @Get('current/driver-location')
  getCurrentDriverLocation(@Req() req) {
    return this.bookingService.getCurrentDriverLocation(req.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(CustomerGuard)
  @Post('current/cancel')
  cancelCurrentBooking(@Req() req) {
    return this.bookingService.cancelCurrentBooking(req.customerId);
  }
}