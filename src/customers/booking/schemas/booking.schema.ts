import { Prop, SchemaFactory, Schema } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { BookingStatus } from "../dto/booking-status.dto";
import { PaymentStatus } from "../dto/payment-status.dto";

export type BookingDocument = Booking & Document;

@Schema({ timestamps: true })
export class Booking extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'Customer',
    required: true,
  })
  customerId: Types.ObjectId;

  @Prop() pickupAddress: string;
  @Prop() dropAddress: string;

  @Prop({ type: { lat: Number, lng: Number, }, })

  pickupLocation: { lat: number; lng: number; };

  @Prop({ type: { lat: Number, lng: Number, }, })

  dropLocation: { lat: number; lng: number; };

  @Prop() distanceKm: number;
  @Prop() durationMin: number;

  @Prop() tripType: string;
  @Prop() vehicleType: string;

  @Prop()
  receiverName: string;

  @Prop()
  receiverMobile: string;

  @Prop() baseFare: number;
  @Prop() loadingCharge: number;
  @Prop() discount: number;
  @Prop() payableAmount: number;

  @Prop({ enum: BookingStatus, })
  status: BookingStatus;

  @Prop({ enum: ['ONLINE', 'CASH'], default: 'ONLINE' })
  paymentMethod: 'ONLINE' | 'CASH';

  @Prop({ required: false })
  razorpayOrderId: string;

  @Prop()
  razorpayPaymentId: string;

  @Prop()
  razorpaySignature: string;

  @Prop({ type: String, enum: PaymentStatus, default: PaymentStatus.PENDING, })
  paymentStatus: PaymentStatus;

  @Prop()
  driverId: string;

  @Prop()
  driverName: string;

  @Prop({ type: [String], default: [] })
  rejectedDrivers: string[];

  @Prop({
    type: {
      lat: Number,
      lng: Number,
    },
  })
  lastDriverLocation?: {
    lat: number;
    lng: number;
  };

  @Prop()
  driverToPickupDistanceKm: number;

  @Prop({ type: Number, default: null })
  driverToPickupEtaMin: number | null;

  @Prop({ type: Date, default: null })
  tripStartTime: Date | null;

  @Prop({ type: Date, default: null })
  tripEndTime: Date | null;

  @Prop({ type: Number, default: null })
  pickupToDropEtaMin: number | null;

  @Prop({ type: Number, default: null })
  remainingDistanceKm: number | null;

  // Final trip values
  @Prop({ type: Number, default: null })
  actualDistanceKm: number | null;

  @Prop({ type: Number, default: null })
  actualDurationMin: number | null;

  @Prop({ type: Number, default: null })
  finalFare: number | null;

  // Earnings split
  @Prop({ type: Number, default: null })
  driverEarning: number | null;

  @Prop({ type: Number, default: null })
  platformCommission: number | null;

  @Prop({ type: Date })
  fareFinalizedAt: Date; 

  @Prop()
  pickupCharge: number;

  @Prop({ required: true, index: true })
  city: string;

  // GPS trail
  @Prop({
    type: [
      {
        lat: { type: Number },
        lng: { type: Number },
        timestamp: { type: Date },
      },
    ],
    default: [],
  })
  routePath: {
    lat: number;
    lng: number;
    timestamp: Date;
  }[];
  
  @Prop({ type: Date })
  arrivedAtPickupAt: Date;

  @Prop()
  customerName: string;

  @Prop()
  customerMobile: string;

}

export const BookingSchema = SchemaFactory.createForClass(Booking);