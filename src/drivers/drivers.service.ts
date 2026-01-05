import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Driver, DriverDocument } from './schemas/driver.schema';
import { DriverPersonalDto } from './dto/driver-personal.dto';
import { DriverVehicleDto } from './dto/driver-vehicle.dto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from 'src/auth/auth.service';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';
import { BookingStatus } from 'src/customers/booking/dto/booking-status.dto';
import { Booking, BookingDocument } from 'src/customers/booking/schemas/booking.schema';
import { UpdateLocationDto } from './dto/update-location.dto';
import { GoogleMapsService } from 'src/common/google-maps.service';
import { LiveTrackingGateway } from 'src/gateways/live-tracking.gateway';
import { Withdraw, WithdrawDocument } from './schemas/withdraw.schema';
import { Pricing, PricingDocument } from 'src/customers/booking/schemas/pricing.schema';
import { DigiLockerService } from './digilocker.service';
import { PaymentStatus } from 'src/customers/booking/dto/payment-status.dto';


@Injectable()
export class DriversService {
  constructor(
    private readonly mapsService: GoogleMapsService,
    private readonly liveGateway: LiveTrackingGateway,
    private readonly digiLockerService: DigiLockerService,
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @InjectModel(Withdraw.name) private WithdrawModel: Model<WithdrawDocument>,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(Pricing.name) private pricingModel: Model<PricingDocument>,
  ) { }

  // 1. Personal (OTP step)
  async registerPersonal(mobile: string, dto: DriverPersonalDto) {
    const exists = await this.findByMobile(mobile);
    if (exists) throw new BadRequestException("Mobile already exists");

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const created = new this.driverModel({
      ...dto,
      password: hashedPassword,
      mobile,
      status: "personal_completed"
    });

    const saved = await created.save();

    await this.authService.createTempData(dto.mobile, 'driver', {
      driverId: saved._id,
      ...dto
    });

    // Issue next-step token for vehicle step
    const token = this.jwtService.sign(
      { driverId: saved._id, userType: 'driver' },
      { expiresIn: '1d' }
    );

    return {
      message: "Personal details saved",
      token,
    };
  }

  // 2. Vehicle Registration
  async registerVehicle(driverId: string, dto: DriverVehicleDto) {
    const driver = await this.driverModel.findById(driverId);
    if (!driver) throw new NotFoundException("Driver not found");

    await this.driverModel.updateOne(
      { _id: driverId },
      {
        $set: {
          ...dto,
          status: 'Vehicle Details completed'
        }
      }
    );

    return {
      message: "Vehicle details saved. Continue to document upload."
    };
  }

  // 3. Upload Documents
  async uploadDocuments(driverId: string, files) {
    const driver = await this.driverModel.findById(driverId);
    if (!driver) throw new NotFoundException("Driver not found");

    const docs = {
      aadhaar: files?.aadhaar?.[0]?.filename || null,
      panCard: files?.panCard?.[0]?.filename || null,
      licenseFront: files?.licenseFront?.[0]?.filename || null,
      licenseBack: files?.licenseBack?.[0]?.filename || null,
    };

    await this.driverModel.updateOne(
      { _id: driverId },
      {
        $set: {
          documents: docs,
          status: ' Documents Uploaded '
        }
      }
    );

    await this.authService.createTempData(driver.mobile, 'driver', {
      driverId,
      ...driver.toObject(),
      documents: docs,
    });

    // send OTP
    const result = await this.authService.sendOtpForRegistration(driver.mobile);

    return {
      message: "OTP sent for final verification",
      otp: result.otp,
    };
  }

  async findByMobile(mobile: string) {
    return this.driverModel.findOne({ mobile });
  }

  // 4. DigiLocker INIT (get login URL)
  async initDigiLocker(driverId: string) {
    const driver = await this.driverModel.findById(driverId);
    if (!driver) throw new NotFoundException('Driver not found');

    return this.digiLockerService.getAuthUrl(driverId);
  }

  // 5. DigiLocker CALLBACK (documents + OTP)
  async uploadDocumentsViaDigiLocker(driverId: string, authCode: string) {
    const driver = await this.driverModel.findById(driverId);
    if (!driver) throw new NotFoundException('Driver not found');

    const docs = await this.digiLockerService.fetchDocuments(authCode);

    const documents = {
      aadhaar: docs.aadhaar,
      panCard: docs.panCard,
      licenseFront: docs.licenseFront,
      licenseBack: docs.licenseBack,
      source: 'DIGILOCKER',
      digilockerRefId: docs.referenceId,
      verified: true,
    };

    await this.driverModel.updateOne(
      { _id: driverId },
      {
        $set: {
          documents,
          status: 'Documents Uploaded',
        },
      },
    );

    // 🔥 SAME OTP LOGIC AS MANUAL UPLOAD
    await this.authService.createTempData(driver.mobile, 'driver', {
      driverId,
      ...driver.toObject(),
      documents,
    });

    const result = await this.authService.sendOtpForRegistration(driver.mobile);

    return {
      message: 'Documents fetched from DigiLocker. OTP sent.',
      otp: result.otp, // remove in prod
    };
  }

  // 6. Driver Status 
  async updateOnlineStatus(
    driverId: string,
    dto: UpdateDriverStatusDto,
  ) {
    const driver = await this.driverModel.findById(driverId);

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // ✅ check DB location instead of DTO
    if (
      dto.isOnline &&
      (!driver.currentLocation ||
        !driver.currentLocation.coordinates ||
        driver.currentLocation.coordinates.length !== 2)
    ) {
      throw new BadRequestException('Update location before going online');
    }

    await this.driverModel.findByIdAndUpdate(driverId, {
      isOnline: dto.isOnline,
      isAvailable: dto.isOnline,
    });

    return {
      message: dto.isOnline ? 'Driver ONLINE' : 'Driver OFFLINE',
    };
  }

  // 7. Pending Requests
  async getPendingRequests(driverId: string) {
    return this.bookingModel.find({
      status: BookingStatus.DRIVER_NOTIFIED,
      rejectedDrivers: { $ne: driverId },
    });
  }

  // ACCEPT BOOKING 
  async acceptBooking(driverId: string, bookingId: string) {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new BadRequestException('Booking not found');

    if (booking.status !== BookingStatus.DRIVER_NOTIFIED) {
      throw new BadRequestException('Booking no longer available');
    }

    const driver = await this.driverModel.findById(driverId);
    if (!driver || !driver.isAvailable) {
      throw new BadRequestException('Driver not available');
    }

    // 1️⃣ ASSIGN DRIVER (LOCK BOOKING)
    booking.driverId = driverId;
    booking.status = BookingStatus.DRIVER_ASSIGNED;


    // 2️⃣ ⭐ DRIVER → PICKUP DISTANCE (YOUR CODE — KEEP IT HERE)
    const { distanceKm, durationMin } =
      await this.mapsService.getDistanceAndDuration(
        driver.currentLocation.coordinates[1], // lat
        driver.currentLocation.coordinates[0], // lng
        booking.pickupLocation.lat,
        booking.pickupLocation.lng,
      );

    const pickupCharge = this.calculatePickupCharge(distanceKm);

    booking.driverToPickupDistanceKm = distanceKm;
    booking.driverToPickupEtaMin = durationMin;
    booking.pickupCharge = pickupCharge;

    await booking.save();

    // 3️⃣ MARK DRIVER BUSY
    await this.driverModel.findByIdAndUpdate(driverId, {
      isAvailable: false,
      isOnTrip: true,
    });

    // 4️⃣ START LIVE TRACKING
    this.liveGateway.startTracking(bookingId);

    return {
      message: 'Booking accepted successfully',
      bookingId: booking._id,
      driverToPickupDistanceKm: distanceKm,
      pickupCharge,
    };
  }

  // REJECT
  async rejectBooking(driverId: string, bookingId: string) {
    await this.bookingModel.updateOne(
      { _id: bookingId },
      { $addToSet: { rejectedDrivers: driverId } },
    );

    return { message: 'Rejected' };
  }

  // START TRIP
  async startTrip(driverId: string, bookingId: string) {
    const booking = await this.bookingModel.findOneAndUpdate(
      {
        _id: bookingId,
        driverId,
        status: BookingStatus.DRIVER_ASSIGNED,
      },
      {
        $set: {
          status: BookingStatus.TRIP_STARTED,
          tripStartTime: new Date(),
        },
      },
      { new: true },
    );

    if (!booking) throw new BadRequestException('Invalid trip');

    this.liveGateway.startTracking(bookingId);

    const { durationMin, distanceKm } =
      await this.mapsService.getDistanceAndDuration(
        booking.pickupLocation.lat,
        booking.pickupLocation.lng,
        booking.dropLocation.lat,
        booking.dropLocation.lng,
      );

    booking.pickupToDropEtaMin = durationMin;
    booking.remainingDistanceKm = distanceKm;

    await booking.save();

    return { message: 'Trip started' };
  }

  // Complete Trip
  async completeTrip(driverId: string, bookingId: string) {
    const booking = await this.bookingModel.findOne({
      _id: bookingId,
      driverId,
      status: BookingStatus.TRIP_STARTED,
    });

    if (!booking) throw new BadRequestException('Invalid trip');

    // 1️⃣ Get pricing (never trust stored fares blindly)
    const pricing = await this.pricingModel.findOne({
      vehicleType: booking.vehicleType,
      isActive: true,
    });

    if (!pricing) {
      throw new BadRequestException('Pricing not found');
    }

    // 2️⃣ Core fare calculation
    const tripDistanceKm = booking.distanceKm;
    const baseFare = pricing.baseFare;
    const distanceFare = tripDistanceKm * pricing.perKmRate;
    const pickupCharge = booking.pickupCharge || 0;

    const finalFare =
      Math.round(baseFare + distanceFare + pickupCharge);

    // 3️⃣ Platform commission
    const commissionPercent = pricing.commissionPercent || 20;
    const commissionAmount =
      Math.round((finalFare * commissionPercent) / 100);

    const driverEarning = finalFare - commissionAmount;

    // 4️⃣ Update booking
    booking.status = BookingStatus.TRIP_COMPLETED;
    booking.tripEndTime = new Date();
    booking.finalFare = finalFare;
    booking.driverEarning = driverEarning;
    booking.fareFinalizedAt = new Date();
    booking.platformCommission = commissionAmount;

    if (booking.tripStartTime) {
      booking.actualDurationMin = Math.ceil(
        (Date.now() - booking.tripStartTime.getTime()) / 60000
      );
    }

    if (booking.paymentMethod === 'ONLINE') {
      // Online payment already done earlier
      booking.paymentStatus = PaymentStatus.SUCCESS;

      // razorpayPaymentId, orderId, signature
      // are assumed to be saved at payment success time
    } else {
      // CASH payment
      booking.paymentMethod = 'CASH';
      booking.paymentStatus = PaymentStatus.SUCCESS;
    }

    await booking.save();

    // 5️⃣ Update driver status
    await this.driverModel.findByIdAndUpdate(driverId, {
      isAvailable: true,
      isOnTrip: false,
    });

    // 6️⃣ Wallet credit
    await this.driverModel.findByIdAndUpdate(driverId, {
      $inc: { walletBalance: driverEarning },
    });

    // 7️⃣ Stop live tracking
    this.liveGateway.stopTracking(bookingId);

    return {
      message: 'Trip completed successfully',
      fare: {
        finalFare,
        pickupCharge,
        distanceFare,
        driverEarning,
        platformCommission: commissionAmount,
      },
    };
  }


  // ================= UPDATE DRIVER LOCATION =================
  async updateLocation(driverId: string, dto: UpdateLocationDto,) {
    const { lat, lng } = dto;

    // update driver live location
    await this.driverModel.findByIdAndUpdate(driverId, {
      currentLocation: {
        type: 'Point',
        coordinates: [lng, lat],
      },
    });

    // find active booking
    const booking = await this.bookingModel.findOne({
      driverId,
      status: {
        $in: [
          BookingStatus.DRIVER_ASSIGNED,
          BookingStatus.TRIP_STARTED,
        ],
      },
    });

    if (booking) {
      // 🚀 Push location to customer
      await this.liveGateway.emitDriverLocation(
        booking._id.toString(),
        { lat, lng },
      );
    }

    // calculate distance to pickup
    if (booking) {
      const distanceToPickup =
        this.mapsService.haversineDistance(
          lat,
          lng,
          booking.pickupLocation.lat,
          booking.pickupLocation.lng,
        );
      // 50 meters threshold
      if (
        distanceToPickup <= 0.05 &&
        !booking.arrivedAtPickupAt
      ) {
        booking.arrivedAtPickupAt = new Date();
        await booking.save();
      }
    }
    return { message: 'Location updated' };
  }

  // 13. Driver Earnings
  async getDriverEarnings(driverId: string) {
    // Get all trips or bookings for the driver
    const trips = await this.bookingModel.find({
      driverId,
      status: BookingStatus.TRIP_COMPLETED
    });

    // Calculate total earnings
    const totalEarnings = trips.reduce((sum, trip) => sum + (trip.driverEarning || 0), 0);

    // Optionally, get wallet balance if you have a wallet model
    const driver = await this.driverModel.findById(driverId).lean();

    // Month-wise earnings
    const monthEarnings: { [key: string]: number } = {};

    trips.forEach(trip => {
      if (!trip.fareFinalizedAt || trip.driverEarning == null) return;

      const date = new Date(trip.fareFinalizedAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      // e.g., "2025-12"

      if (!monthEarnings[monthKey]) monthEarnings[monthKey] = 0;
      monthEarnings[monthKey] += trip.driverEarning;
    });

    //Withdrawal history
    const withdrawals = await this.WithdrawModel
      .find({ driverId })
      .sort({ createdAt: -1 });

    const withdrawalHistory = withdrawals.map((w: WithdrawDocument) => ({
      id: w._id,
      amount: w.amount,
      status: w.status,
      requestedAt: w.createdAt,
      completedAt: w.updatedAt
    }));

    return {
      driverId,
      totalEarnings,
      tripsCount: trips.length,
      balance: driver?.walletBalance || 0,
      monthEarnings,
      withdrawalHistory,
    };
  }

  // 14. Driver Withdrawals 
  async getWalletSummary(driverId: string) {
    const driver = await this.driverModel.findById(driverId).lean();
    const completedTripsCount = await this.bookingModel.countDocuments({
      driverId,
      status: BookingStatus.TRIP_COMPLETED
    });

    return {
      walletBalance: driver?.walletBalance || 0,
      completedTripsCount,
    };
  }

  // Add Bank Details
  async addBankDetails(
    driverId: string,
    bankDetails: {
      bankName: string;
      accountHolderName: string;
      bankAccountNumber: string;
      ifscCode: string;
    },
  ) {
    const driver = await this.driverModel.findById(driverId);

    if (!driver) {
      throw new BadRequestException('Driver not found');
    }

    driver.bankDetails = {
      bankName: bankDetails.bankName,
      accountHolderName: bankDetails.accountHolderName,
      bankAccountNumber: bankDetails.bankAccountNumber,
      ifscCode: bankDetails.ifscCode,
    };

    await driver.save();

    return {
      message: 'Bank details added successfully',
      bankDetails: driver.bankDetails,
    };
  }


  // 15. Request Withdrawal
  async requestWithdrawal(driverId: string, amount: number) {
    const driver = await this.driverModel.findById(driverId);

    if (!driver?.bankDetails?.bankAccountNumber) {
      throw new BadRequestException('Add bank details before withdrawal');
    }

    if ((driver.walletBalance || 0) < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    driver.walletBalance -= amount;
    await driver.save();

    const withdraw = await this.WithdrawModel.create({
      driverId,
      amount,
      status: 'PENDING',
    });

    return {
      message: 'Withdrawal requested successfully',
      requestId: withdraw._id,
      walletBalance: driver.walletBalance,
    };
  }

  // 16. Withdrawal History
  async getWithdrawalHistory(driverId: string) {
    const history = await this.WithdrawModel
      .find({ driverId })
      .sort({ createdAt: -1 });

    return history.map(w => ({
      id: w._id,
      amount: w.amount,
      status: w.status,
      requestedAt: w.createdAt,
      completedAt: w.updatedAt
    }));
  }

  // 17. Driver Dashboard
  async getDriverDashboard(driverId: string) {
    // ─────────────────────────────────────────────
    // 1️. Date range for TODAY
    // ─────────────────────────────────────────────
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // ─────────────────────────────────────────────
    // 2️. Today’s completed trips
    // ─────────────────────────────────────────────
    const todaysTrips = await this.bookingModel.find({
      driverId,
      status: BookingStatus.TRIP_COMPLETED,
      tripEndTime: { $gte: startOfDay, $lte: endOfDay },
    });

    let todayEarnings = 0;
    let todayTripCount = todaysTrips.length;
    let todayTotalHours = 0;

    todaysTrips.forEach(trip => {
      todayEarnings += trip.driverEarning || 0;

      if (trip.tripStartTime && trip.tripEndTime) {
        const durationMs =
          new Date(trip.tripEndTime).getTime() -
          new Date(trip.tripStartTime).getTime();
        todayTotalHours += durationMs;
      }
    });

    // convert ms → hours (rounded)
    const todayHours = Math.round((todayTotalHours / (1000 * 60 * 60)) * 10) / 10;

    // ─────────────────────────────────────────────
    // 3️. Wallet Balance
    // ─────────────────────────────────────────────
    const driver = await this.driverModel.findById(driverId).lean();

    // ─────────────────────────────────────────────
    // 4️. Ongoing Trip (if any)
    // ─────────────────────────────────────────────
    const ongoingTrip = await this.bookingModel.findOne({
      driverId,
      status: BookingStatus.TRIP_STARTED,
    });

    // ─────────────────────────────────────────────
    // 5️. Latest Completed Trip
    // ─────────────────────────────────────────────
    const latestTrip = await this.bookingModel
      .findOne({
        driverId,
        status: BookingStatus.TRIP_COMPLETED,
      })
      .sort({ tripEndTime: -1 });

    // ─────────────────────────────────────────────
    // 6. Final Dashboard Response
    // ─────────────────────────────────────────────
    return {
      todaySummary: {
        earnings: todayEarnings,
        trips: todayTripCount,
        hours: todayHours,
      },

      wallet: {
        balance: driver?.walletBalance || 0,
      },

      ongoingTrip: ongoingTrip
        ? {
          bookingId: ongoingTrip._id,
          pickup: ongoingTrip.pickupLocation,
          drop: ongoingTrip.dropLocation,
        }
        : null,

      latestTrip: latestTrip
        ? {
          bookingId: latestTrip._id,
          fare: latestTrip.finalFare,
          pickup: latestTrip.pickupLocation,
          drop: latestTrip.dropLocation,
          pickupTime: latestTrip.tripStartTime,
          dropTime: latestTrip.tripEndTime,
        }
        : null,
    };
  }

  // 18. Trip History for driver 
  async getTripHistory(
    driverId: string,
    page = 1,
    limit = 10,
  ) {
    const skip = (page - 1) * limit;

    // Total completed trips
    const totalTrips = await this.bookingModel.countDocuments({
      driverId,
      status: BookingStatus.TRIP_COMPLETED,
    });

    // Trip history list
    const trips = await this.bookingModel
      .find({
        driverId,
        status: BookingStatus.TRIP_COMPLETED,
      })
      .sort({ tripEndTime: -1 })
      .skip(skip)
      .limit(limit);

    const tripHistory = trips.map(trip => ({
      bookingId: trip._id,
      date: trip.tripEndTime,
      pickup: trip.pickupLocation,
      drop: trip.dropLocation,
      fare: trip.finalFare,
    }));

    return {
      summary: {
        totalTrips,
      },
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalTrips / limit),
      },
      trips: tripHistory,
    };
  }

  // 19. Driver Profile
  async getDriverProfile(driverId: string) {
    const driver = await this.driverModel.findById(driverId).lean();

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return {
      header: {
        name: `${driver.firstName} ${driver.lastName}`,
        vehicleName: driver.vehicleModel || null,
      },
      profile: {
        firstName: driver.firstName,
        lastName: driver.lastName,
        mobile: driver.mobile,
      },
    };
  }

  // 20. Driver Update Profile 
  async updateDriverProfile(
    driverId: string,
    data: {
      firstName?: string;
      lastName?: string;
    },
  ) {
    const driver = await this.driverModel.findById(driverId);
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (data.firstName !== undefined) driver.firstName = data.firstName;
    if (data.lastName !== undefined) driver.lastName = data.lastName;

    await driver.save();

    return {
      message: 'Profile updated successfully',
      profile: {
        firstName: driver.firstName,
        lastName: driver.lastName,
        mobile: driver.mobile,
      },
    };
  }

  // 21. Driver Logout
  async logoutDriver(driverId: string) {
    await this.driverModel.findByIdAndUpdate(driverId, {
      isOnline: false,
      isAvailable: false,
    });

    return {
      message: 'Logged out successfully',
    };
  }

  // ================= PICKUP CHARGE CALCULATION =================
  private calculatePickupCharge(distanceKm: number): number {
    if (distanceKm <= 3) return 10;
    if (distanceKm <= 5) return 20;
    if (distanceKm <= 50) return 40;
    return 50; // safety cap
  }
}