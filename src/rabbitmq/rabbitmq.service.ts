import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
    private connection: amqp.ChannelModel;
    private channel: amqp.Channel;

    private readonly EXCHANGE_NAME = 'reservations.exchange';
    private readonly WAIT_QUEUE = 'reservations.wait.queue';
    private readonly PROCESS_QUEUE = 'reservations.process.queue';

    async onModuleInit() {
    await this.connect();
    await this.setupTopology();
  }

    async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async connect() {
    const rabbitMqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
    this.connection = await amqp.connect(rabbitMqUrl);
    this.channel = await this.connection.createChannel();
    console.log('🐇 Conectado ao mensageiro RabbitMQ com sucesso!');
  }

  private async setupTopology() {
    await this.channel.assertExchange(this.EXCHANGE_NAME, 'direct', { durable: true });

    await this.channel.assertQueue(this.PROCESS_QUEUE, { durable: true });
    await this.channel.bindQueue(this.PROCESS_QUEUE, this.EXCHANGE_NAME, 'reservation.expired');

    await this.channel.assertQueue(this.WAIT_QUEUE, {
      durable: true,
      deadLetterExchange: this.EXCHANGE_NAME, 
      deadLetterRoutingKey: 'reservation.expired', 
      messageTtl: 30000, 
    });
  }

  async sendToWaitQueue(reservationId: string) {
    const message = JSON.stringify({ reservationId });
    this.channel.sendToQueue(this.WAIT_QUEUE, Buffer.from(message));
    console.log(`⏳ Reserva ${reservationId} enviada para a fila de espera (30s).`);
  }

  async consumeExpiredReservations(callback: (reservationId: string) => Promise<void>) {
    await this.channel.consume(this.PROCESS_QUEUE, async (msg) => {
      if (msg !== null) {
        const content = JSON.parse(msg.content.toString());
        console.log(`⏰ O tempo acabou! Processando a reserva expirada: ${content.reservationId}`);
        
        await callback(content.reservationId);
        
        this.channel.ack(msg);
        }
      });
    }
}