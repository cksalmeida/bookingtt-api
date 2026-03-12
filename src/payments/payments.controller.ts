import { Controller, Post, Body } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout')
  async checkout(
    @Body() body: { reservationId: string; paymentMethod: string }
  ) {
    return this.paymentsService.processCheckout(body.reservationId, body.paymentMethod);
  }
}