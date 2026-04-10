import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

const mockPaymentsService = {
  processCheckout: jest.fn(),
};

describe('PaymentsController', () => {
  let controller: PaymentsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: mockPaymentsService }],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkout', () => {
    it('deve chamar processCheckout com reservationId e paymentMethod e retornar o resultado', async () => {
      const body = { reservationId: 'res-1', paymentMethod: 'credit_card' };
      const serviceResult = { message: 'Pagamento confirmado', reservationId: 'res-1' };

      mockPaymentsService.processCheckout.mockResolvedValue(serviceResult);

      const result = await controller.checkout(body);

      expect(mockPaymentsService.processCheckout).toHaveBeenCalledWith(
        'res-1',
        'credit_card',
      );
      expect(result).toBe(serviceResult);
    });

    it('deve propagar exceções lançadas pelo service', async () => {
      mockPaymentsService.processCheckout.mockRejectedValue(new Error('Reserva expirada'));

      await expect(
        controller.checkout({ reservationId: 'res-1', paymentMethod: 'pix' }),
      ).rejects.toThrow('Reserva expirada');
    });
  });
});
