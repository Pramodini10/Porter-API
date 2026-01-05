import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Date, Document } from "mongoose";

export type WithdrawDocument = Withdraw & Document & { createdAt: Date; updatedAt: Date };

@Schema({ timestamps: true })
export class Withdraw {
    @Prop({ required: true })
    driverId: string;

    @Prop({ required: true })
    amount: number;

    @Prop({ enum: ['PENDING', 'APPROVED','REJECTED'], default: 'PENDING' })
    status: string;
}

export const WithdrawSchema = SchemaFactory.createForClass(Withdraw);
