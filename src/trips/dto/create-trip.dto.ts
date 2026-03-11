import { IsString, IsNotEmpty, IsNumber, IsDateString, Min } from 'class-validator';

export class CreateTripDto {
  @IsString()
  @IsNotEmpty({ message: 'O ID técnico da viagem é obrigatório' })
  technicalTripId: string;

  @IsString()
  @IsNotEmpty()
  bus: string;

  @IsDateString({}, { message: 'A data de embarque deve ser uma data válida ISO 8601' })
  boardingTime: string;

  @IsNumber()
  @Min(1, { message: 'O preço deve ser maior que zero' })
  price: number;

  @IsNumber()
  @Min(10, { message: 'O ônibus deve ter no mínimo 10 poltronas' })
  totalSeats: number;
}