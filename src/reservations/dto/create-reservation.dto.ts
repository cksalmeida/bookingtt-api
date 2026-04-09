import { IsString, IsNotEmpty, IsArray, ArrayMinSize } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  tripId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Você deve selecionar pelo menos uma poltrona.' })
  @IsString({ each: true, message: 'Cada ID de poltrona deve ser um texto.' })
  seatIds: string[];
}