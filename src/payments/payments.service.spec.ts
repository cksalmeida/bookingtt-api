import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  reservation: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Usa fake timers para não esperar o setTimeout de 1.5s real
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processCheckout', () => {
    const reservationId = 'res-1';
    const paymentMethod = 'credit_card';

    it('deve confirmar o pagamento com sucesso', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: reservationId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60000), // expira daqui a 60s
      });
      mockPrisma.reservation.updateMany.mockResolvedValue({ count: 1 });

      // Inicia a chamada mas não aguarda — ela fica parada no setTimeout
      const promise = service.processCheckout(reservationId, paymentMethod);

      // Avança todos os timers pendentes (o setTimeout de 1.5s)
      jest.runAllTimersAsync();

      const result = await promise;

      expect(result.status).toBe('CONFIRMED');
      expect(result.reservationId).toBe(reservationId);
      expect(result.method).toBe(paymentMethod);
      expect(mockPrisma.reservation.updateMany).toHaveBeenCalledWith({
        where: { id: reservationId, status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });
    });

    it('deve lançar BadRequestException quando a reserva não existe', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue(null);

      await expect(
        service.processCheckout(reservationId, paymentMethod),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.reservation.updateMany).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando a reserva está expirada', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: reservationId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000), // já expirou
      });

      await expect(
        service.processCheckout(reservationId, paymentMethod),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException quando a reserva não está PENDING', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: reservationId,
        status: 'CONFIRMED',
        expiresAt: new Date(Date.now() + 60000),
      });

      await expect(
        service.processCheckout(reservationId, paymentMethod),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar ConflictException quando a reserva expira durante o processamento do pagamento', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: reservationId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60000),
      });
      // count === 0 significa que o cancelUnpaidReservation já atualizou o status antes do updateMany
      mockPrisma.reservation.updateMany.mockResolvedValue({ count: 0 });

      const promise = service.processCheckout(reservationId, paymentMethod);
      jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow(ConflictException);
    });
  });
});
