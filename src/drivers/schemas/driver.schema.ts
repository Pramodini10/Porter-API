import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DriverDocument = Driver & Document;

export enum WithdrawalStatus {
    NONE = 'NONE',
    REQUESTED = 'REQUESTED',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
}

@Schema({ timestamps: true })
export class Driver {
    // Step 1 - Personal
    @Prop()
    firstName: string;

    @Prop()
    lastName: string;

    @Prop({ required: true, unique: true })
    mobile: string;

    @Prop()
    emergencyMobile: string;

    @Prop({ required: true })
    password: string;

    // Step 2 - Vehicle
    @Prop()
    vehicleMake: string;

    @Prop()
    vehicleModel: string;

    @Prop()
    vehicleType: string;

    @Prop({ unique: true })
    vehicleNumber: string;

    @Prop()
    chassisNumber: string;

    // Step 3 - Documents
    @Prop({
        type: {
            aadhaar: String,
            panCard: String,
            licenseFront: String,
            licenseBack: String,

            // NEW
            source: {
                type: String,
                enum: ['UPLOAD', 'DIGILOCKER'],
                default: 'UPLOAD',
            },

            digilockerRefId: String, // txn / consent id
            verified: { type: Boolean, default: false },
        },
        default: {},
    })
    documents: {
        aadhaar?: string;
        panCard?: string;
        licenseFront?: string;
        licenseBack?: string;
        source?: 'UPLOAD' | 'DIGILOCKER';
        digilockerRefId?: string;
        verified?: boolean;
    };

    @Prop({ default: 'pending' }) // pending → personal done → vehicle done → completed
    status: string;

    @Prop({ default: true })
    isAvailable: boolean;

    @Prop({ default: false })
    isOnline: boolean;

    @Prop({ default: false })
    isOnTrip: boolean;

    @Prop({
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point',
        },
        coordinates: {
            type: [Number], // [lng, lat]
            default: [0, 0],
        },
    })
    currentLocation: {
        type: 'Point';
        coordinates: number[];
    };

    @Prop({ type: Number, default: 0 })
    walletBalance: number;

    @Prop({
        type: {
            bankName: String,
            accountHolderName: String,
            bankAccountNumber: String,
            ifscCode: String,
        },
        default: null,
    })
    bankDetails: {
        bankName: string;
        accountHolderName: string;
        bankAccountNumber: string;
        ifscCode: string;
    };

}

export const DriverSchema = SchemaFactory.createForClass(Driver);

DriverSchema.index({ currentLocation: '2dsphere' });