import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver, DriverSchema } from './schemas/driver.schema';
import { JwtModule } from '@nestjs/jwt';
import { DriverRegistrationGuard } from './driver-registration.guard';
import { AuthModule } from 'src/auth/auth.module';
import { Booking, BookingSchema } from 'src/customers/booking/schemas/booking.schema';
import { LiveTrackingGateway } from 'src/gateways/live-tracking.gateway';
import { GatewaysModule } from 'src/gateways/gateways.module';
import { Withdraw, WithdrawSchema } from './schemas/withdraw.schema';
import { Pricing, PricingSchema } from 'src/customers/booking/schemas/pricing.schema';
import { DigiLockerService } from './digilocker.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Driver.name, schema: DriverSchema },
    { name: Booking.name, schema: BookingSchema }, { name: Withdraw.name, schema: WithdrawSchema },
    { name: Pricing.name, schema: PricingSchema },]),
    JwtModule.register({
      secret: 'driver-registration-secret',
      signOptions: { expiresIn: '1d' },
    }), forwardRef(() => AuthModule), GatewaysModule,
  ],
  controllers: [DriversController],
  providers: [DriversService, DriverRegistrationGuard, LiveTrackingGateway, DigiLockerService,],
  exports: [DriversService],
})
export class DriversModule { }
