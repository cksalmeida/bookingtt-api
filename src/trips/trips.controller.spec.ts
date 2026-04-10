import { Test, TestingModule } from '@nestjs/testing';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

const mockTripsService = {
  createTripWithSeats: jest.fn(),
};

describe('TripsController', () => {
  let controller: TripsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TripsController],
      providers: [{ provide: TripsService, useValue: mockTripsService }],
    }).compile();

    controller = module.get<TripsController>(TripsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('deve chamar createTripWithSeats com o DTO recebido e retornar o resultado', async () => {
      const dto = { origin: 'São Paulo', destination: 'Rio de Janeiro', departureTime: new Date(), totalSeats: 40 };
      const serviceResult = { id: 'trip-1', ...dto };

      mockTripsService.createTripWithSeats.mockResolvedValue(serviceResult);

      const result = await controller.create(dto as any);

      expect(mockTripsService.createTripWithSeats).toHaveBeenCalledWith(dto);
      expect(result).toBe(serviceResult);
    });

    it('deve propagar exceções lançadas pelo service', async () => {
      mockTripsService.createTripWithSeats.mockRejectedValue(new Error('Erro ao criar viagem'));

      await expect(controller.create({} as any)).rejects.toThrow('Erro ao criar viagem');
    });
  });
});
