import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TripsService } from './trips.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  $transaction: jest.fn((callback) => callback(mockPrisma)),
  trip: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  seat: {
    createMany: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('TripsService', () => {
  let service: TripsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TripsService>(TripsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('deve retornar a lista de viagens', async () => {
      const fakeTrips = [
        { id: 'trip-1', technicalTripId: 'SP-RJ-001', bus: 'Leito', boardingTime: new Date(), price: 150, _count: { seats: 40 } },
      ];
      mockPrisma.trip.findMany.mockResolvedValue(fakeTrips);

      const result = await service.findAll();

      expect(result).toBe(fakeTrips);
      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { boardingTime: 'asc' } }),
      );
    });
  });

  describe('findSeats', () => {
    it('deve retornar as poltronas com o resumo correto', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue({ id: 'trip-1' });
      mockPrisma.seat.findMany.mockResolvedValue([
        { id: 'seat-1', number: '01', status: 'AVAILABLE' },
        { id: 'seat-2', number: '02', status: 'RESERVED' },
        { id: 'seat-3', number: '03', status: 'AVAILABLE' },
      ]);

      const result = await service.findSeats('trip-1');

      expect(result.tripId).toBe('trip-1');
      expect(result.totalSeats).toBe(3);
      // Apenas as duas poltronas com status AVAILABLE devem ser contadas
      expect(result.availableSeats).toBe(2);
      expect(result.seats).toHaveLength(3);
    });

    it('deve lançar NotFoundException quando a viagem não existe', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue(null);

      await expect(service.findSeats('trip-inexistente')).rejects.toThrow(NotFoundException);

      // Não deve nem chegar na query de poltronas
      expect(mockPrisma.seat.findMany).not.toHaveBeenCalled();
    });
  });

  describe('createTripWithSeats', () => {
    const dto = {
      technicalTripId: 'SP-RJ-001',
      bus: 'Leito Executivo',
      boardingTime: '2026-05-01T08:00:00.000Z',
      price: 150,
      totalSeats: 3,
    };

    it('deve criar a viagem e as poltronas numeradas corretamente', async () => {
      const fakeTrip = { id: 'trip-1', ...dto };
      mockPrisma.trip.create.mockResolvedValue(fakeTrip);
      mockPrisma.seat.createMany.mockResolvedValue({ count: 3 });

      const result = await service.createTripWithSeats(dto);

      expect(result.tripId).toBe('trip-1');
      expect(result.totalSeatsCreated).toBe(3);

      // Verifica que as poltronas foram criadas com números formatados com zero à esquerda
      expect(mockPrisma.seat.createMany).toHaveBeenCalledWith({
        data: [
          { tripId: 'trip-1', number: '01' },
          { tripId: 'trip-1', number: '02' },
          { tripId: 'trip-1', number: '03' },
        ],
      });
    });

    it('deve converter boardingTime string para Date ao criar a viagem', async () => {
      mockPrisma.trip.create.mockResolvedValue({ id: 'trip-1' });
      mockPrisma.seat.createMany.mockResolvedValue({ count: 3 });

      await service.createTripWithSeats(dto);

      const callArgs = mockPrisma.trip.create.mock.calls[0][0];
      expect(callArgs.data.boardingTime).toBeInstanceOf(Date);
    });

    it('deve propagar erros da transação', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('DB indisponível'));

      await expect(service.createTripWithSeats(dto)).rejects.toThrow('DB indisponível');
    });
  });
});
