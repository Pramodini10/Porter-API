import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { Owner, OwnerDocument } from './schemas/owner.schema';
import { Booking, BookingDocument } from 'src/customers/booking/schemas/booking.schema';
import { Driver, DriverDocument } from 'src/drivers/schemas/driver.schema';
import { Withdraw, WithdrawDocument } from 'src/drivers/schemas/withdraw.schema';
import { GoogleMapsService } from 'src/common/google-maps.service';
import { Customer, CustomerDocument } from 'src/customers/schemas/customer.schema';
import { UpdateProfileDto } from './dto/profile-update.dto';

@Injectable()
export class OwnerService {
  constructor(
    @InjectModel(Owner.name) private ownerModel: Model<OwnerDocument>,
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @InjectModel(Withdraw.name) private withdrawModel: Model<WithdrawDocument>,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    private readonly mapsService: GoogleMapsService,) { }

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
        chassisNumber: driver.chassisNumber,
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

    return Promise.all(
      bookings.map(async b => {
        const driver = b.driverId
          ? driverMap.get(b.driverId.toString())
          : null;

        return {
          bookingId: b._id,

          driverName: driver
            ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim()
            : 'Not Assigned',

          driverMobile: driver?.mobile || '—',

          pickupPoint: b.pickupLocation
            ? {
              lat: b.pickupLocation.lat,
              lng: b.pickupLocation.lng,
              address: await this.mapsService.getCityFromLatLng(
                b.pickupLocation.lat,
                b.pickupLocation.lng,
              ),
            }
            : null,

          dropPoint: b.dropLocation
            ? {
              lat: b.dropLocation.lat,
              lng: b.dropLocation.lng,
              address: await this.mapsService.getCityFromLatLng(
                b.dropLocation.lat,
                b.dropLocation.lng,
              ),
            }
            : null,

          customerId: b.customerId,
          amount: b.finalFare || 0,
          status: b.status,
        };
      })
    );
  }

  // 5. TRIP MANAGEMENT (Driver-wise summary)
  async getTripManagement() {
    // 1. Get all drivers
    const drivers = await this.driverModel
      .find()
      .select('firstName lastName mobile vehicleType')
      .lean();

    // 2. Get all bookings
    const bookings = await this.bookingModel
      .find()
      .select('driverId status')
      .lean();

    // 3. Group bookings by driverId
    const bookingMap = new Map<string, any[]>();

    for (const booking of bookings) {
      if (!booking.driverId) continue;

      const driverId = booking.driverId.toString();
      if (!bookingMap.has(driverId)) {
        bookingMap.set(driverId, []);
      }
      bookingMap.get(driverId)?.push(booking);
    }

    // 4. Prepare response
    const result = drivers.map(driver => {
      const driverId = driver._id.toString();
      const driverBookings = bookingMap.get(driverId) || [];

      const totalTrips = driverBookings.length;

      const completedTrips = driverBookings.filter(
        b => b.status === 'TRIP_COMPLETED'
      ).length;

      const ongoingTrips = driverBookings.filter(
        b =>
          b.status === 'TRIP_STARTED' ||
          b.status === 'DRIVER_ASSIGNED'
      ).length;

      return {
        driverId,
        driverName: `${driver.firstName || ''} ${driver.lastName || ''}`.trim(),
        driverMobile: driver.mobile,
        vehicleType: driver.vehicleType || '—',
        totalTrips,
        completedTrips,
        ongoingTrips,
      };
    });

    return {
      status: true,
      data: result,
    };
  }

  // 6. APPROVE WITHDRAWAL
  async approveWithdrawal(withdrawalId: string) {
    const withdraw = await this.withdrawModel.findOne({
      _id: withdrawalId,
      status: 'PENDING',
    });

    if (!withdraw) {
      throw new BadRequestException('No pending withdrawal request');
    }

    const driver = await this.driverModel.findById(withdraw.driverId);
    if (!driver) throw new BadRequestException('Driver not found');

    if ((driver.walletBalance || 0) < withdraw.amount) {
      throw new BadRequestException('Insufficient balance at approval time');
    }

    // ✅ DEDUCT MONEY ONLY ON APPROVAL
    driver.walletBalance -= withdraw.amount;
    await driver.save();

    withdraw.status = 'APPROVED';
    await withdraw.save();

    return {
      message: 'Withdrawal approved successfully',
    };
  }

  //7. REJECT WITHDRAWAL 
  async rejectWithdrawal(withdrawalId: string) {
    const withdraw = await this.withdrawModel.findOne({
      _id: withdrawalId,
      status: 'PENDING',
    });

    if (!withdraw) {
      throw new BadRequestException('No pending withdrawal request');
    }

    // ❗ NO WALLET CHANGES
    withdraw.status = 'REJECTED';
    await withdraw.save();

    return {
      message: 'Withdrawal rejected successfully',
    };
  }

  // 8. Owner: Get all withdrawal requests
  async getAllWithdrawals() {
    return this.withdrawModel
      .find()
      .populate('driverId', 'firstName lastName mobile')
      .sort({ createdAt: -1 });
  }
 
  //9. ================= CUSTOMER LIST (FIXED) ================= 
  async getAllCustomers() {
    const customers = await this.customerModel
      .find()
      .lean();

    return {
      status: true,
      data: customers.map(customer => ({
        id: customer._id,
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
        mobile: customer.mobile,
        email: customer.email
      })),
    };
  }

  // 10. Admin Dashboard
  async getDashboardStats() {
    const [
      totalTrips,
      totalDrivers,
      totalCustomers,
      cancelledTrips,
      completedTrips,
      ongoingTrips,
      revenue,
    ] = await Promise.all([
      this.bookingModel.countDocuments(), //totalTrips
      this.driverModel.countDocuments(),  //totalDrivers
      this.customerModel.countDocuments(), //totalCustomers
      this.bookingModel.countDocuments({ status: 'CANCELLED' }), //cancelled Trips
      this.bookingModel.countDocuments({status: 'TRIP_COMPLETED',}), //completed Trips
      this.bookingModel.countDocuments({
        status: { $in: ['DRIVER_NOTIFIED','DRIVER_ASSIGNED', 'TRIP_STARTED'] },
      }), //Ongoing Trips
      this.bookingModel.aggregate([
        {
          $match: {
            status: { $in: ['TRIP_COMPLETED', 'COMPLETED'] },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$finalFare' },
          },
        },
      ]),
    ]);

    return {
      totalTrips,
      totalDrivers,
      totalCustomers,
      cancelledTrips,
      completedTrips,
      ongoingTrips,
      totalRevenue: revenue[0]?.total || 0,
    };
  }

  async getOngoingTrips() {
    return this.bookingModel
      .find({
        status: { $in: ['DRIVER_ASSIGNED', 'TRIP_STARTED'] },
      })
      .populate('driverId', 'firstName lastName mobile')
      .populate('customerId', 'name mobile')
      .select(
        'pickupLocation dropLocation estimatedFare status createdAt'
      )
      .sort({ createdAt: -1 });
  }

  // Month-wose Trip Amount (BAR CHART)
  async getMonthWiseRevenue() {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);

    return this.bookingModel.aggregate([
      {
        $match: {
          status: { $in: ['TRIP_COMPLETED', 'COMPLETED'] },
          createdAt: { $gte: startOfYear },
        },
      },
      {
        $group: {
          _id: { $month: '$createdAt' }, // 1 = Jan
          amount: { $sum: '$finalFare' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  //Weekly Trips (LINE CHART)
  async getWeeklyTrips() {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 6);

    return this.bookingModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfWeek },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          trips: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  //Monthly Vehicle Registrations (LINE CHART)
  async getMonthlyVehicleRegistrations() {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);

    return this.driverModel.aggregate([
      {
        $match: { createdAt: { $gte: startOfYear } },
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  // ONE Method for ADMIN Dashboard
  async getAdminDashboard() {
    const [
      stats,
      monthWiseRevenue,
      weeklyTrips,
      monthlyVehicleRegistrations,
      ongoingTrips,
      withdrawals,
    ] = await Promise.all([
      this.getDashboardStats(),            // TOP CARDS
      this.getMonthWiseRevenue(),          // BAR CHART
      this.getWeeklyTrips(),               // LINE CHART
      this.getMonthlyVehicleRegistrations(), // LINE CHART
      this.getOngoingTrips(),              // TABLE
      this.getAllWithdrawals(),            // TABLE
    ]);

    return {
      stats,
      charts: {
        monthWiseRevenue,
        weeklyTrips,
        monthlyVehicleRegistrations,
      },
      ongoingTrips,
      withdrawals,
    };
  }

  // Owner Profile
  async getProfile(ownerId: string) {
      const owner = await this.ownerModel.findById(ownerId).select(
        'firstName lastName mobile email'
      );
  
      if (!owner) {
        throw new BadRequestException('Owner not found');
      }
  
      return {
        firstName: owner.firstName,
        lastName: owner.lastName,
        mobile: owner.mobile,
        email: owner.email,
      };
    }

    //Update Owner Profile 
      async updateProfile(ownerId: string, dto: UpdateProfileDto) {
        const owner = await this.ownerModel.findByIdAndUpdate(
          ownerId,
          { $set: dto },
          { new: true }
        ).select('firstName lastName mobile email');
    
        if (!owner) {
          throw new BadRequestException('Owner not found');
        }
    
        return {
          message: 'Profile updated successfully',
          profile: owner,
        };
      }
}