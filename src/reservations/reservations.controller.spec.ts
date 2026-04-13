import { Test, TestingModule } from '@nestjs/testing';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

const mockReservationsService = {
  reserveSeat: jest.fn(),
  findOne: jest.fn(),
};

describe('ReservationsController', () => {
  let controller: ReservationsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReservationsController],
      providers: [
        { provide: ReservationsService, useValue: mockReservationsService },
      ],
    }).compile();

    controller = module.get<ReservationsController>(ReservationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('deve chamar reserveSeat com o DTO recebido e retornar o resultado', async () => {
      const dto = { userId: 'user-1', tripId: 'trip-1', seatIds: ['seat-1'] };
      const serviceResult = {
        message: '1 poltrona(s) reservada(s) com sucesso!',
        reservations: [{ reservationId: 'res-1', seatId: 'seat-1', expiresAt: new Date() }],
      };

      mockReservationsService.reserveSeat.mockResolvedValue(serviceResult);

      const result = await controller.create(dto);

      expect(mockReservationsService.reserveSeat).toHaveBeenCalledWith(dto);

      expect(result).toBe(serviceResult);
    });

    it('deve propagar exceções lançadas pelo service', async () => {
      const dto = { userId: 'user-1', tripId: 'trip-1', seatIds: ['seat-1'] };
      mockReservationsService.reserveSeat.mockRejectedValue(new Error('Conflito'));

      await expect(controller.create(dto)).rejects.toThrow('Conflito');
    });
  });

  describe('findOne', () => {
    it('deve extrair o id da URL e retornar a reserva', async () => {
      const serviceResult = { id: 'res-1', seatId: 'seat-1', status: 'PENDING' };
      mockReservationsService.findOne.mockResolvedValue(serviceResult);

      const result = await controller.findOne('res-1');

      expect(mockReservationsService.findOne).toHaveBeenCalledWith('res-1');
      expect(result).toBe(serviceResult);
    });

    it('deve propagar exceções lançadas pelo service', async () => {
      mockReservationsService.findOne.mockRejectedValue(new Error('Não encontrada'));

      await expect(controller.findOne('res-inexistente')).rejects.toThrow('Não encontrada');
    });
  });
});
