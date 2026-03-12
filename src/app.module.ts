import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TripsModule } from './trips/trips.module';
import { RedisModule } from './redis/redis.module';
import { ReservationsModule } from './reservations/reservations.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [PrismaModule, TripsModule, RedisModule, ReservationsModule, RabbitmqModule, PaymentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
