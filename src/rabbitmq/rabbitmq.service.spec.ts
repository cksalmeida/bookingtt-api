// Mockamos o amqplib antes de qualquer import que o use
jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { RabbitmqService } from './rabbitmq.service';
import * as amqp from 'amqplib';

const mockChannel = {
  assertExchange: jest.fn(),
  assertQueue: jest.fn(),
  bindQueue: jest.fn(),
  sendToQueue: jest.fn(),
  consume: jest.fn(),
  ack: jest.fn(),
  close: jest.fn(),
};

const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  close: jest.fn(),
};

describe('RabbitmqService', () => {
  let service: RabbitmqService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Configura a cadeia: connect → connection → channel
    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);
    mockConnection.createChannel.mockResolvedValue(mockChannel);
    mockChannel.assertExchange.mockResolvedValue(undefined);
    mockChannel.assertQueue.mockResolvedValue(undefined);
    mockChannel.bindQueue.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [RabbitmqService],
    }).compile();

    // init() dispara onModuleInit — sem isso, connect() e setupTopology() não são chamados
    await module.init();

    service = module.get<RabbitmqService>(RabbitmqService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve conectar ao RabbitMQ e configurar filas no onModuleInit', async () => {
    expect(amqp.connect).toHaveBeenCalledTimes(1);
    expect(mockChannel.assertExchange).toHaveBeenCalledWith(
      'reservations.exchange',
      'direct',
      { durable: true },
    );
    expect(mockChannel.assertQueue).toHaveBeenCalledWith('reservations.process.queue', { durable: true });
    expect(mockChannel.assertQueue).toHaveBeenCalledWith('reservations.wait.queue', {
      durable: true,
      deadLetterExchange: 'reservations.exchange',
      deadLetterRoutingKey: 'reservation.expired',
    });
  });

  describe('sendToWaitQueue', () => {
    it('deve publicar a mensagem na fila de espera com o TTL correto', async () => {
      await service.sendToWaitQueue('res-1', 45000);

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'reservations.wait.queue',
        Buffer.from(JSON.stringify({ reservationId: 'res-1' })),
        { expiration: '45000' },
      );
    });
  });

  describe('consumeExpiredReservations', () => {
    it('deve chamar o callback com o reservationId quando uma mensagem chega', async () => {
      const callback = jest.fn().mockResolvedValue(undefined);
      const fakeMsg = {
        content: Buffer.from(JSON.stringify({ reservationId: 'res-1' })),
      };

      // Simula o consume chamando o handler imediatamente com a mensagem fake
      mockChannel.consume.mockImplementation((_queue, handler) => handler(fakeMsg));

      await service.consumeExpiredReservations(callback);

      expect(callback).toHaveBeenCalledWith('res-1');
      expect(mockChannel.ack).toHaveBeenCalledWith(fakeMsg);
    });

    it('não deve chamar o callback quando a mensagem é null', async () => {
      const callback = jest.fn();
      mockChannel.consume.mockImplementation((_queue, handler) => handler(null));

      await service.consumeExpiredReservations(callback);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
