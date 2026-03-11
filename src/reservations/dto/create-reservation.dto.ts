import { IsString, IsNotEmpty } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  userId: string; 

  @IsString()
  @IsNotEmpty()
  tripId: string; 

  @IsString()
  @IsNotEmpty()
  seatId: string; 
}