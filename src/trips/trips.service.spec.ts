import { Test, TestingModule } from '@nestjs/testing';
import { TripsService } from './trips.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  $transaction: jest.fn((callback) => callback(mockPrisma)),
  trip: {
    create: jest.fn(),
  },
  seat: {
    createMany: jest.fn(),
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
