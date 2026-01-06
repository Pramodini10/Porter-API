import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OwnerController } from './owner.controller';
import { OwnerService } from './owner.service';
import { Owner, OwnerSchema } from './schemas/owner.schema';
import { AuthModule } from 'src/auth/auth.module';
import { Driver, DriverSchema } from 'src/drivers/schemas/driver.schema';
import { Booking, BookingSchema } from 'src/customers/booking/schemas/booking.schema';
import { Withdraw, WithdrawSchema } from 'src/drivers/schemas/withdraw.schema';
import { JwtModule } from '@nestjs/jwt';
import { Customer, CustomerSchema } from 'src/customers/schemas/customer.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Owner.name, schema: OwnerSchema },
    { name: Driver.name, schema: DriverSchema }, { name: Booking.name, schema: BookingSchema },
    { name: Withdraw.name, schema: WithdrawSchema },{ name: Customer.name, schema: CustomerSchema }]),
  forwardRef(() => AuthModule),JwtModule], 
  controllers: [OwnerController],
  providers: [OwnerService],
  exports: [OwnerService],
})
export class OwnerModule {}
