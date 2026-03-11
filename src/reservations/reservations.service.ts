import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async reserveSeat(data: CreateReservationDto) {
    const lockKey = `lock:seat:${data.seatId}`;
    const acquiredLock = await this.redis.acquireLock(lockKey, 5000);

    if (!acquiredLock) {
      throw new ConflictException('Esta poltrona está sendo processada por outro usuário. Tente novamente em instantes.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const seat = await tx.seat.findUnique({
          where: { id: data.seatId },
        });

        if (!seat) {
          throw new BadRequestException('Poltrona não encontrada.');
        }

        if (seat.status !== 'AVAILABLE') {
          throw new ConflictException('Esta poltrona já foi reservada ou vendida.');
        }

        const expirationTime = new Date();
        expirationTime.setSeconds(expirationTime.getSeconds() + 30);

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
          message: 'Poltrona reservada com sucesso! Você tem 30 segundos para pagar.',
          reservationId: reservation.id,
          expiresAt: reservation.expiresAt,
        };
      });

    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }
}