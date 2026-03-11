import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TripsService {
  constructor(private prisma: PrismaService) {}

  async createTripWithSeats(data: {
    technicalTripId: string;
    bus: string;
    boardingTime: string;
    price: number;
    totalSeats: number; // Ex: 40 poltronas
  }) {
    //$transaction para garantir o princípio ACID
    return this.prisma.$transaction(async (tx) => {
      
      const trip = await tx.trip.create({
        data: {
          technicalTripId: data.technicalTripId,
          bus: data.bus,
          boardingTime: new Date(data.boardingTime),
          price: data.price,
        },
      });

      const seatsData = Array.from({ length: data.totalSeats }).map((_, index) => {
        const seatNumber = (index + 1).toString().padStart(2, '0'); 
        return {
          tripId: trip.id,
          number: seatNumber,
        };
      });

      await tx.seat.createMany({
        data: seatsData,
      });

      return {
        message: 'Viagem e poltronas criadas com sucesso!',
        tripId: trip.id,
        totalSeatsCreated: seatsData.length,
      };
    });
  }
}