import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

const mockPrisma = {
  $transaction: jest.fn((callback) => callback(mockPrisma)),
  reservation: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  seat: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockRedis = {
  acquireMultipleLocks: jest.fn(),
  releaseMultipleLocks: jest.fn(),
};

const mockRabbitmq = {
  consumeExpiredReservations: jest.fn(),
  sendToWaitQueue: jest.fn(),
};

describe('ReservationsService', () => {
  let service: ReservationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));

    mockRabbitmq.consumeExpiredReservations.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: RabbitmqService, useValue: mockRabbitmq },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ----------------------------------------------------------------
  // findOne
  // ----------------------------------------------------------------

  describe('findOne', () => {
    it('deve retornar a reserva quando encontrada', async () => {
      const fakeReservation = { id: 'res-1', seatId: 'seat-1', status: 'PENDING' };
      mockPrisma.reservation.findUnique.mockResolvedValue(fakeReservation);

      const result = await service.findOne('res-1');

      expect(result).toBe(fakeReservation);
      expect(mockPrisma.reservation.findUnique).toHaveBeenCalledWith({
        where: { id: 'res-1' },
      });
    });

    it('deve lançar NotFoundException quando a reserva não existe', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue(null);

      await expect(service.findOne('res-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  // ----------------------------------------------------------------
  // reserveSeat
  // ----------------------------------------------------------------

  describe('reserveSeat', () => {
    const dto = { userId: 'user-1', tripId: 'trip-1', seatIds: ['seat-1'] };

    it('deve reservar a poltrona com sucesso e retornar as reservas', async () => {
      const fakeSeat = { id: 'seat-1', number: 1, status: 'AVAILABLE' };
      const fakeReservation = {
        id: 'res-1',
        seatId: 'seat-1',
        expiresAt: new Date(),
      };

      mockRedis.acquireMultipleLocks.mockResolvedValue(['lock:seat:seat-1']);
      mockPrisma.seat.findUnique.mockResolvedValue(fakeSeat);
      mockPrisma.reservation.create.mockResolvedValue(fakeReservation);
      mockPrisma.seat.update.mockResolvedValue({});
      mockRabbitmq.sendToWaitQueue.mockResolvedValue(undefined);

      const result = await service.reserveSeat(dto);

      expect(result.reservations).toHaveLength(1);
      expect(result.reservations[0].reservationId).toBe('res-1');
      expect(result.reservations[0].seatId).toBe('seat-1');

      expect(mockRedis.acquireMultipleLocks).toHaveBeenCalledWith(
        ['lock:seat:seat-1'],
        5000,
      );
      expect(mockRedis.releaseMultipleLocks).toHaveBeenCalledWith([
        'lock:seat:seat-1',
      ]);

      expect(mockRabbitmq.sendToWaitQueue).toHaveBeenCalledWith('res-1', 45000);
    });

    it('deve lançar ConflictException quando nenhum lock é adquirido', async () => {
      mockRedis.acquireMultipleLocks.mockResolvedValue([]);

      await expect(service.reserveSeat(dto)).rejects.toThrow(ConflictException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando a poltrona não existe', async () => {
      mockRedis.acquireMultipleLocks.mockResolvedValue(['lock:seat:seat-1']);
      mockPrisma.seat.findUnique.mockResolvedValue(null); 

      await expect(service.reserveSeat(dto)).rejects.toThrow(BadRequestException);
    });

    it('deve lançar ConflictException quando a poltrona já está reservada', async () => {
      mockRedis.acquireMultipleLocks.mockResolvedValue(['lock:seat:seat-1']);
      mockPrisma.seat.findUnique.mockResolvedValue({
        id: 'seat-1',
        number: 1,
        status: 'RESERVED',
      });

      await expect(service.reserveSeat(dto)).rejects.toThrow(ConflictException);
    });

    it('deve liberar os locks mesmo quando a transação lança erro', async () => {
      mockRedis.acquireMultipleLocks.mockResolvedValue(['lock:seat:seat-1']);
      mockPrisma.$transaction.mockRejectedValue(new Error('DB explodiu'));

      await expect(service.reserveSeat(dto)).rejects.toThrow('DB explodiu');

      expect(mockRedis.releaseMultipleLocks).toHaveBeenCalledWith([
        'lock:seat:seat-1',
      ]);
    });
  });

  // ----------------------------------------------------------------
  // cancelReservation
  // ----------------------------------------------------------------

  describe('cancelReservation', () => {
    it('deve cancelar a reserva e liberar a poltrona quando status é PENDING', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: 'res-1',
        seatId: 'seat-1',
        status: 'PENDING',
      });
      mockPrisma.seat.update.mockResolvedValue({});
      mockPrisma.reservation.update.mockResolvedValue({});

      const result = await service.cancelReservation('res-1');

      expect(result.message).toBeDefined();
      expect(mockPrisma.seat.update).toHaveBeenCalledWith({
        where: { id: 'seat-1' },
        data: { status: 'AVAILABLE' },
      });
      expect(mockPrisma.reservation.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: { status: 'CANCELLED' },
      });
    });

    it('deve lançar NotFoundException quando a reserva não existe', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue(null);

      await expect(service.cancelReservation('res-inexistente')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando a reserva já está CONFIRMED', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: 'res-1',
        seatId: 'seat-1',
        status: 'CONFIRMED',
      });

      await expect(service.cancelReservation('res-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando a reserva já está CANCELLED', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: 'res-1',
        seatId: 'seat-1',
        status: 'CANCELLED',
      });

      await expect(service.cancelReservation('res-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deve propagar erro se a transação falhar sem alterar nada', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: 'res-1',
        seatId: 'seat-1',
        status: 'PENDING',
      });
      mockPrisma.$transaction.mockRejectedValue(new Error('DB explodiu'));

      await expect(service.cancelReservation('res-1')).rejects.toThrow('DB explodiu');

      // A transação falhou — nenhum update parcial deve ter ocorrido
      expect(mockPrisma.seat.update).not.toHaveBeenCalled();
      expect(mockPrisma.reservation.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelUnpaidReservation', () => {
    it('deve cancelar a reserva e liberar a poltrona quando status é PENDING', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: 'res-1',
        seatId: 'seat-1',
        status: 'PENDING',
      });
      mockPrisma.seat.update.mockResolvedValue({});
      mockPrisma.reservation.update.mockResolvedValue({});

      await service.cancelUnpaidReservation('res-1');

      expect(mockPrisma.seat.update).toHaveBeenCalledWith({
        where: { id: 'seat-1' },
        data: { status: 'AVAILABLE' },
      });
      expect(mockPrisma.reservation.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: { status: 'EXPIRED' },
      });
    });

    it('não deve alterar nada quando a reserva já foi paga (não é PENDING)', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: 'res-1',
        seatId: 'seat-1',
        status: 'CONFIRMED',
      });

      await service.cancelUnpaidReservation('res-1');

      expect(mockPrisma.seat.update).not.toHaveBeenCalled();
      expect(mockPrisma.reservation.update).not.toHaveBeenCalled();
    });

    it('não deve fazer nada quando a reserva não existe', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue(null);

      await service.cancelUnpaidReservation('res-inexistente');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
