import { forwardRef, Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { AuthModule } from 'src/auth/auth.module';
import { DriversModule } from 'src/drivers/drivers.module';
import { DriverSchema } from 'src/drivers/schemas/driver.schema';
import { GoogleMapsService } from 'src/common/google-maps.service';
import { GatewaysModule } from 'src/gateways/gateways.module';
import { LiveTrackingGateway } from 'src/gateways/live-tracking.gateway';
import { Pricing, PricingSchema } from './schemas/pricing.schema';
import { City, CitySchema } from 'src/master/schemas/city.schema';
import { VehicleSchema } from 'src/master/schemas/vehicle.schema';
import { CustomerSchema } from '../schemas/customer.schema';

@Module({
  imports: [ MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema },{ name: 'Driver', schema: DriverSchema },
    { name: Pricing.name, schema: PricingSchema },{ name: City.name, schema: CitySchema },{ name: 'Vehicle', schema: VehicleSchema },
    { name: 'Customer', schema: CustomerSchema }]),
  forwardRef(() =>AuthModule), DriversModule,GatewaysModule,],
  controllers: [BookingController],
  providers: [BookingService, GoogleMapsService,LiveTrackingGateway],
  exports: [BookingService],
})
export class BookingModule {}
