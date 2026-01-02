import { BadRequestException, ConflictException, forwardRef, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { AuthService } from 'src/auth/auth.service';
import { CustomerDashboardResponseDto } from './dto/dashboard.dto';
import { Booking, BookingDocument } from './booking/schemas/booking.schema';
import { UpdateProfileDto } from './dto/profile-update.dto';

@Injectable()
export class CustomersService {
  constructor(@InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @Inject(forwardRef(() => AuthService)) private authService: AuthService,) { }

  private async hashPassword(password: string) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async create(createCustomerDto: CreateCustomerDto): Promise<Partial<Customer>> {
    const { email, password, ...rest } = createCustomerDto;

    // Pre-check uniqueness
    const existing = await this.customerModel.findOne({ email }).lean();
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await this.hashPassword(password);

    const created = new this.customerModel({ ...rest, email, password: hashed });

    try {
      const saved = await created.save();
      const { password: _, ...safe } = saved.toObject();
      return safe;
    } catch (err: any) {
      // Handle duplicate key race condition
      if (err?.code === 11000) {
        throw new ConflictException('Email already registered');
      }
      console.error('create customer error', err);
      throw new InternalServerErrorException('Failed to create customer');
    }
  }

  async findByMobile(mobile: string) {
    return this.customerModel.findOne({ mobile });
  }

  // optional helper
  findByEmail(email: string) {
    return this.customerModel.findOne({ email }).lean();
  }

  async registerCustomer(dto: CreateCustomerDto) {
    // 1️⃣ Check mobile
    const mobileExists = await this.findByMobile(dto.mobile);
    if (mobileExists) {
      throw new BadRequestException('Mobile already registered');
    }

    // 2️⃣ Check email
    const emailExists = await this.findByEmail(dto.email);
    if (emailExists) {
      throw new ConflictException('Email already registered');
    }

    // 3️⃣ Store TEMP data (NO DB INSERT)
    await this.authService.createTempData(dto.mobile, 'customer', dto);

    // 4️⃣ Generate + send OTP immediately
    const { otp } = await this.authService.createSession(
      dto.mobile,
      'customer',
      dto,
    );

    return {
      message: 'OTP sent successfully',
      mobile: dto.mobile,
      otp, // ⚠️ remove in production
    };
  }


  //customers/Dashboard
  async getDashboard(customerId: string): Promise<CustomerDashboardResponseDto> {
    const customer = await this.customerModel.findById(customerId);

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    const activeBooking = await this.bookingModel.findOne({
      customerId,
      status: {
        $in: [
          'VEHICLE_SELECTED',
          'PAYMENT_PREVIEW',
          'PAYMENT_INITIATED',
          'CONFIRMED',
          'DRIVER_ASSIGNED',
        ],
      },
    }).sort({ createdAt: -1 });

    return {
      user: {
        name: customer.firstName,
        mobile: customer.mobile,
      },

      categories: [
        { id: 'bike', label: 'Bike', icon: 'bike.png' },
        { id: 'tempo', label: 'Tempo', icon: 'tempo.png' },
        { id: 'truck', label: 'Truck', icon: 'truck.png' },
        { id: 'cab', label: 'Cab', icon: 'cab.png' },
      ],

      banners: [
        { id: 1, image: 'banner1.png', title: 'Flat 20% off on first ride' },
        { id: 2, image: 'banner2.png', title: 'Best prices for trucks' },
      ],

      activeTrip: activeBooking
        ? {
          bookingId: activeBooking._id,
          vehicleType: activeBooking.vehicleType,
          status: activeBooking.status,
          pickupAddress: activeBooking.pickupAddress,
          dropAddress: activeBooking.dropAddress,
          distanceKm: activeBooking.distanceKm,
          durationMin: activeBooking.durationMin,
          fare:
            activeBooking.payableAmount ??
            activeBooking.baseFare,
          driver: activeBooking.driverId
            ? { name: activeBooking.driverName }
            : null,
        }
        : null,
    };
  }

  // Customer Profile 
  async getProfile(customerId: string) {
    const customer = await this.customerModel.findById(customerId).select(
      'firstName lastName mobile email'
    );

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    return {
      firstName: customer.firstName,
      lastName: customer.lastName,
      mobile: customer.mobile,
      email: customer.email,
    };
  }

  //Update Customer Profile 
  async updateProfile(customerId: string, dto: UpdateProfileDto) {
    const customer = await this.customerModel.findByIdAndUpdate(
      customerId,
      { $set: dto },
      { new: true }
    ).select('firstName lastName mobile email');

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    return {
      message: 'Profile updated successfully',
      profile: customer,
    };
  }

}

