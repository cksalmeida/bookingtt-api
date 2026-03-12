import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async processCheckout(reservationId: string, paymentMethod: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new BadRequestException('Reserva não encontrada no sistema.');
    }

    const now = new Date();
    if (reservation.expiresAt < now) {
      throw new BadRequestException(`Reserva expirou. Esta reserva expirou em ${reservation.expiresAt.toISOString()}`);
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestException(`Não é possível pagar. O status atual da reserva é: ${reservation.status}`);
    }

    console.log(`💳 Iniciando comunicação com o gateway de pagamento...`);
    console.log(`💸 Processando pagamento via ${paymentMethod.toUpperCase()} para a reserva ${reservationId}...`);
    
    // Simulando a demora da operadora de cartão de crédito (1.5 segundos)
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    console.log(`✅ Pagamento aprovado pela operadora!`);

    const updatedCount = await this.prisma.reservation.updateMany({
      where: { 
        id: reservationId,
        status: 'PENDING'
      },
      data: { status: 'CONFIRMED' },
    });

    if (updatedCount.count === 0) {
      throw new ConflictException('O pagamento foi aprovado, mas a sua reserva expirou nesse meio tempo. O estorno será realizado.');
    }

    return {
      message: 'Pagamento processado com sucesso! A poltrona é sua.',
      reservationId: reservationId,
      status: 'CONFIRMED',
      method: paymentMethod
    };
  }
}