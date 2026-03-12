import { Injectable, BadRequestException, ConflictException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private rabbitmq: RabbitmqService, 
  ) {}

  async onModuleInit() {
    await this.rabbitmq.consumeExpiredReservations(async (reservationId) => {
      await this.cancelUnpaidReservation(reservationId);
    });
  }

  async reserveSeat(data: CreateReservationDto) {
    const lockKey = `lock:seat:${data.seatId}`;
    const acquiredLock = await this.redis.acquireLock(lockKey, 5000);

    if (!acquiredLock) {
      throw new ConflictException('Esta poltrona está sendo processada por outro usuário. Tente novamente em instantes.');
    }
    const expirationTimeSeconds = 45;
    let reservationResult;

    try {
      reservationResult = await this.prisma.$transaction(async (tx) => {
        const seat = await tx.seat.findUnique({ where: { id: data.seatId } });
        
        if (!seat) throw new BadRequestException('Poltrona não encontrada.');
        if (seat.status !== 'AVAILABLE') throw new ConflictException('Esta poltrona já foi reservada ou vendida.');

        const expirationTime = new Date();
        expirationTime.setSeconds(expirationTime.getSeconds() + expirationTimeSeconds);

        const reservation = await tx.reservation.create({
          data: {
            userId: data.userId,
            tripId: data.tripId,
            seatId: data.seatId,
            status: 'PENDING',
            expiresAt: expirationTime,
          },
        });

        await tx.seat.update({
          where: { id: data.seatId },
          data: { status: 'RESERVED' },
        });

        return {
          message: 'Poltrona reservada com sucesso! Você tem 45 segundos para pagar.',
          reservationId: reservation.id,
          expiresAt: reservation.expiresAt,
        };
      });

    } finally {
      await this.redis.releaseLock(lockKey);
    }

    const waitingTimeMs = expirationTimeSeconds * 1000; 
    
    await this.rabbitmq.sendToWaitQueue(reservationResult.reservationId, waitingTimeMs);

    return reservationResult;
  }

  async cancelUnpaidReservation(reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId }
    });

    if (!reservation) return;

    if (reservation.status === 'PENDING') {
      console.log(`❌ Cancelando reserva ${reservationId} por falta de pagamento...`);
      
      await this.prisma.$transaction(async (tx) => {
        await tx.seat.update({
          where: { id: reservation.seatId },
          data: { status: 'AVAILABLE' },
        });
        
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: 'EXPIRED' }, 
        });
      });
      
      console.log(`✅ Poltrona liberada com sucesso e pronta para outro cliente!`);
    } else {
      console.log(`✅ A reserva ${reservationId} já consta como paga. Nenhuma ação necessária.`);
    }
  }
}