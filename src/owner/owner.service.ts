import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { Owner, OwnerDocument } from './schemas/owner.schema';
import { Booking, BookingDocument } from 'src/customers/booking/schemas/booking.schema';
import { Wallet, WalletDocument } from 'src/drivers/schemas/driver-wallet.schema';
import { Driver, DriverDocument } from 'src/drivers/schemas/driver.schema';
import { Withdraw, WithdrawDocument } from 'src/drivers/schemas/withdraw.schema';
import { WithdrawalStatus } from 'src/drivers/schemas/driver.schema';

@Injectable()
export class OwnerService {
  constructor(
    @InjectModel(Owner.name) private ownerModel: Model<OwnerDocument>,
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Withdraw.name) private withdrawModel: Model<WithdrawDocument>,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,) { }

  private async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  // 1. Owner Registration
  async create(createOwnerDto: CreateOwnerDto): Promise<Partial<Owner>> {
    const { email, password, ...rest } = createOwnerDto;
    // explicit email uniqueness check before creation
    const exists = await this.ownerModel.findOne({ email }).lean();
    if (exists) {
      throw new ConflictException('Email is already registered');
    }

    const hashed = await this.hashPassword(password);
    const created = new this.ownerModel({ ...rest, email, password: hashed });

    try {
      const saved = await created.save();
      // remove password before returning
      const { password: _, ...safe } = saved.toObject();
      return safe;
    } catch (err: any) {
      // handle Mongo duplicate key (race conditions)
      if (err?.code === 11000) {
        throw new ConflictException('Email already exists');
      }
      // fallback
      console.error('create owner error', err);
      throw new InternalServerErrorException('Failed to create owner');
    }
  }

  async findByMobile(mobile: string): Promise<Partial<Owner>> {
    const owner = await this.ownerModel.findOne({ mobile }).lean();

    if (!owner) {
      throw new NotFoundException('Owner not found');
    }

    const { password, ...safe } = owner;
    return safe;
  }

  // optional: get by email (for login)
  findByEmail(email: string) {
    return this.ownerModel.findOne({ email }).lean();
  }

  // ================= DRIVER LIST (FIXED) =================
  async getAllDrivers() {
    const drivers = await this.driverModel
      .find()
      .lean();

    return {
      status: true,
      data: drivers.map(driver => ({
        id: driver._id,
        name: `${driver.firstName || ''} ${driver.lastName || ''}`.trim(),
        mobile: driver.mobile,
        status: driver.status,
        isAvailable: driver.isAvailable,
        isOnline: driver.isOnline,
      })),
    };
  }

  // 3. DRIVER DETAILS
  async getDriverDetails(driverId: string) {
    const driver = await this.driverModel.findById(driverId).lean();

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return {
      driver: {
        id: driver._id,
        name: `${driver.firstName} ${driver.lastName}`,
        mobile: driver.mobile,
        isOnline: driver.isOnline,
        isAvailable: driver.isAvailable,
        vehicleType: driver.vehicleType,
        vehicleModel: driver.vehicleModel,
        vehicleNumber: driver.vehicleNumber,
        vehicleMake: driver.vehicleMake,
        status: driver.status
      },
    };
  }

  // 4. Customer Booking deatils
  async getAllBookings() {
    const bookings = await this.bookingModel
      .find()
      .sort({ createdAt: -1 })
      .lean();

    // collect all driverIds (only valid ones)
    const driverIds = bookings
      .map(b => b.driverId)
      .filter(id => typeof id === 'string');

    // fetch drivers in ONE query (important!)
    const drivers = await this.driverModel
      .find({ _id: { $in: driverIds } })
      .select('firstName lastName mobile')
      .lean();

    // map for fast lookup
    const driverMap = new Map(
      drivers.map(d => [d._id.toString(), d])
    );

    return bookings.map(b => {
      const driver = b.driverId
        ? driverMap.get(b.driverId.toString())
        : null;

      return {
        bookingId: b._id,

        driverName: driver
          ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim()
          : 'Not Assigned',

        driverMobile: driver?.mobile || '—',

        pickupPoint: b.pickupLocation,
        dropPoint: b.dropLocation,

        customerId: b.customerId,

        amount: b.finalFare || 0,
        status: b.status,
      };
    });
  }

  // 5. Driver Booking deatils
  async getBookingsByDriver(driverId: string) {
    const bookings = await this.bookingModel
      .find({ driverId })
      .sort({ createdAt: -1 })
      .lean();

    return bookings.map(b => ({
      bookingId: b._id,
      pickup: b.pickupLocation,
      drop: b.dropLocation,
      customerId: b.customerId,
      amount: b.finalFare,
      status: b.status,
      paymentStatus: b.paymentStatus,
      tripStartTime: b.tripStartTime,
      tripEndTime: b.tripEndTime,
    }));
  }

  // 6. APPROVE WITHDRAWAL
  async approveWithdrawal(driverId: string) {
    const withdraw = await this.withdrawModel.findOne({
      driverId,
      status: WithdrawalStatus.REQUESTED,
    });

    if (!withdraw) throw new BadRequestException('No withdrawal request');

    withdraw.status = WithdrawalStatus.APPROVED;
    await withdraw.save();

    return { message: 'Withdrawal approved successfully' };
  }

  //7. REJECT WITHDRAWAL 
  async rejectWithdrawal(driverId: string) {
    const withdraw = await this.withdrawModel.findOne({
      driverId,
      status: WithdrawalStatus.REQUESTED,
    });

    if (!withdraw) throw new BadRequestException('No withdrawal request');

    withdraw.status = WithdrawalStatus.REJECTED;
    await withdraw.save();

    return { message: 'Withdrawal rejected successfully' };
  }
}