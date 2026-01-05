import { Prop, SchemaFactory, Schema } from "@nestjs/mongoose";
import { Document } from 'mongoose';

export type VehicleDocument = Vehicle & Document;

@Schema({ timestamps: true })
export class Vehicle {
  @Prop({ required: true, unique: true })
  vehicleType: string; // Bike | Tempo | Truck

  @Prop({ default: true })
  isActive: boolean;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
