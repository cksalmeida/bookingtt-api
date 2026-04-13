import { Injectable, BadRequestException, ConflictException, NotFoundException, OnModuleInit } from '@nestjs/common';
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

  async findOne(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
    });

    if (!reservation) {
      throw new NotFoundException(`Reserva ${id} não encontrada.`);
    }

    return reservation;
  }

  async cancelReservation(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
    });

    if (!reservation) {
      throw new NotFoundException(`Reserva ${id} não encontrada.`);
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestException(
        `Não é possível cancelar. O status atual da reserva é: ${reservation.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.seat.update({
        where: { id: reservation.seatId },
        data: { status: 'AVAILABLE' },
      });

      await tx.reservation.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    });

    return { message: 'Reserva cancelada com sucesso. A poltrona está disponível novamente.' };
  }

  async reserveSeat(data: CreateReservationDto) {
    const lockKeys = data.seatIds.map((id) => `lock:seat:${id}`);
    const acquiredLocks = await this.redis.acquireMultipleLocks(lockKeys, 5000);

    if (acquiredLocks.length === 0) {
      throw new ConflictException('Uma ou mais poltronas estão sendo processadas por outro usuário. Tente novamente em instantes.');
    }

    const expirationTimeSeconds = 45;
    let reservationResults: { reservationId: string; seatId: string; expiresAt: Date }[];

    try {
      reservationResults = await this.prisma.$transaction(async (tx) => {
        const expirationTime = new Date();
        expirationTime.setSeconds(expirationTime.getSeconds() + expirationTimeSeconds);

        const results: { reservationId: string; seatId: string; expiresAt: Date }[] = [];

        for (const seatId of data.seatIds) {
          const seat = await tx.seat.findUnique({ where: { id: seatId } });

          if (!seat) throw new BadRequestException(`Poltrona ${seatId} não encontrada.`);
          if (seat.status !== 'AVAILABLE') throw new ConflictException(`A poltrona ${seat.number} já foi reservada ou vendida.`);

          const reservation = await tx.reservation.create({
            data: {
              userId: data.userId,
              tripId: data.tripId,
              seatId,
              status: 'PENDING',
              expiresAt: expirationTime,
            },
          });

          await tx.seat.update({
            where: { id: seatId },
            data: { status: 'RESERVED' },
          });

          results.push({ reservationId: reservation.id, seatId, expiresAt: reservation.expiresAt });
        }

        return results;
      });

    } finally {
      await this.redis.releaseMultipleLocks(lockKeys);
    }

    const waitingTimeMs = expirationTimeSeconds * 1000;

    for (const r of reservationResults) {
      await this.rabbitmq.sendToWaitQueue(r.reservationId, waitingTimeMs);
    }

    return {
      message: `${reservationResults.length} poltrona(s) reservada(s) com sucesso! Você tem 45 segundos para pagar.`,
      reservations: reservationResults,
    };
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