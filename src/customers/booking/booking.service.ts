import { BadRequestException, Injectable } from '@nestjs/common';
import { GoogleMapsService } from 'src/common/google-maps.service';
import { RouteCheckDto } from './dto/route-check.dto';
import { BookingEstimateDto } from './dto/booking-estimate.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SelectVehicleDto } from './dto/select-vehicle.dto';
import { ConfigService } from '@nestjs/config';
import { Booking } from './schemas/booking.schema';
import { Driver, DriverDocument } from 'src/drivers/schemas/driver.schema';
import { BookingStatus } from './dto/booking-status.dto';
import { LiveTrackingGateway } from 'src/gateways/live-tracking.gateway';
import { Pricing, PricingDocument } from './schemas/pricing.schema';
import { City, CityDocument } from 'src/master/schemas/city.schema';
import { Vehicle } from 'src/master/schemas/vehicle.schema';

@Injectable()
export class BookingService {

  constructor(
    private readonly mapsService: GoogleMapsService,
    private readonly liveGateway: LiveTrackingGateway,
    @InjectModel('Booking')
    private readonly bookingModel: Model<Booking>, private readonly configService: ConfigService,
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @InjectModel(Pricing.name) private pricingModel: Model<PricingDocument>,
    @InjectModel(City.name) private CityModel: Model<CityDocument>,
    @InjectModel('Vehicle') private readonly vehicleModel: Model<Vehicle>
  ) { }

  // STEP 1: route check (NO DB)
  async routeCheck(dto: RouteCheckDto) {
    const { distanceKm, durationMin } =
      await this.mapsService.getDistanceAndDuration(
        dto.pickupLat,
        dto.pickupLng,
        dto.dropLat,
        dto.dropLng,
      );

    return {
      distanceKm,
      durationMin,
    };
  }

  async getEstimate(dto: BookingEstimateDto) {
    const { distanceKm, durationMin } =
      await this.mapsService.getDistanceAndDuration(
        dto.pickupLat,
        dto.pickupLng,
        dto.dropLat,
        dto.dropLng,
      );

    const city = await this.mapsService.getCityFromLatLng(
      dto.pickupLat,
      dto.pickupLng,
    );

    const vehicles = await this.vehicleModel.find({ isActive: true });

    const pricingList = await this.pricingModel.find({
      vehicleType: { $in: vehicles.map(v => v.vehicleType) },
      isActive: true,
    });

    const isBookingForOther =
      !!dto.receiverName && !!dto.receiverMobile;

    return {
      distanceKm,
      durationMin,
      city,

      bookingFor: isBookingForOther ? 'OTHER' : 'SELF',

      receiver: isBookingForOther
        ? {
          name: dto.receiverName,
          mobile: dto.receiverMobile,
        }
        : null,

      vehicles: vehicles.map(vehicle => {
        const pricing = pricingList.find(
          p => p.vehicleType === vehicle.vehicleType,
        );

        let estimatedFare: number | null = null;

        if (pricing) {
          const baseFare = Number(pricing.baseFare);
          const perKmRate = Number(pricing.perKmRate);
          const distance = Number(distanceKm);

          if (
            Number.isFinite(baseFare) &&
            Number.isFinite(perKmRate) &&
            Number.isFinite(distance)
          ) {
            estimatedFare = Math.round(
              baseFare + distance * perKmRate
            );
          }
        }

        return {
          vehicleType: vehicle.vehicleType,
          estimatedFare,
          etaMin: durationMin,
        };
      }),

    };
  }


  // 3️⃣ CREATE BOOKING + DISPATCH
  async createBooking(customerId: string, dto: SelectVehicleDto) {
    // 🔁 Recalculate (never trust frontend)
    const { distanceKm, durationMin } =
      await this.mapsService.getDistanceAndDuration(
        dto.pickupLat,
        dto.pickupLng,
        dto.dropLat,
        dto.dropLng,
      );

    const city = await this.mapsService.getCityFromLatLng(
      dto.pickupLat,
      dto.pickupLng,
    );

    const booking = await this.bookingModel.create({
      customerId,
      city,
      pickupLocation: { lat: dto.pickupLat, lng: dto.pickupLng },
      dropLocation: { lat: dto.dropLat, lng: dto.dropLng },
      vehicleType: dto.vehicleType,
      distanceKm,
      durationMin,
      status: BookingStatus.SEARCHING_DRIVER,
    });

    // 🔍 Find nearby drivers
    const drivers = await this.driverModel.find({
      isOnline: true,
      isAvailable: true,
      vehicleType: dto.vehicleType,
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [dto.pickupLng, dto.pickupLat],
          },
          $maxDistance: 3000,
        },
      },
    });

    if (!drivers.length) {
      booking.status = BookingStatus.NO_DRIVER_FOUND;
      await booking.save();
      return { message: 'No drivers nearby' };
    }

    // 🔔 Notify drivers
    drivers.forEach(driver => {
      this.liveGateway.server
        .to(`driver:${driver._id}`)
        .emit('booking:request', {
          bookingId: booking._id,
          pickup: booking.pickupLocation,
          drop: booking.dropLocation,
        });
    });

    booking.status = BookingStatus.DRIVER_NOTIFIED;
    await booking.save();

    return { bookingId: booking._id };
  }

  // 4. COMMON HELPER
  private async findCurrentBooking(customerId: string) {
    const booking = await this.bookingModel.findOne({
      customerId,
      status: {
        $in: [
          BookingStatus.SEARCHING_DRIVER,
          BookingStatus.DRIVER_NOTIFIED,
          BookingStatus.DRIVER_ASSIGNED,
          BookingStatus.TRIP_STARTED,
          BookingStatus.NO_DRIVER_FOUND,
        ],
      },
    }).sort({ createdAt: -1 });

    if (!booking) {
      throw new BadRequestException('No active booking found');
    }

    return booking;
  }

  // 5.GET CURRENT BOOKING
  async getCurrentBooking(customerId: string) {
    return this.findCurrentBooking(customerId);
  }

  // 6. GET CURRENT BOOKING STATUS
  async getCurrentBookingStatus(customerId: string) {
    const booking = await this.findCurrentBooking(customerId);
    return { status: booking.status };
  }

  // 7. GET DRIVER LOCATION
  async getCurrentDriverLocation(customerId: string) {
    const booking = await this.findCurrentBooking(customerId);

    if (!booking.driverId) {
      throw new BadRequestException('Driver not assigned yet');
    }

    return booking.lastDriverLocation;
  }

  // 8.CANCEL CURRENT BOOKING
  async cancelCurrentBooking(customerId: string) {
    const booking = await this.findCurrentBooking(customerId);

    if (
      [BookingStatus.TRIP_STARTED, BookingStatus.TRIP_COMPLETED].includes(
        booking.status,
      )
    ) {
      throw new BadRequestException('Cannot cancel at this stage');
    }

    booking.status = BookingStatus.CANCELLED;
    await booking.save();

    if (booking.driverId) {
      await this.driverModel.findByIdAndUpdate(booking.driverId, {
        isAvailable: true,
        isOnTrip: false,
      });
    }

    return { message: 'Booking cancelled successfully' };
  }
}