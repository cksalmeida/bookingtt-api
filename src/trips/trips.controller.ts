import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';

@Controller('trips')
export class TripsController {
  constructor(private tripsService: TripsService) {}

  @Post()
  async create(@Body() createTripDto: CreateTripDto) {
    return this.tripsService.createTripWithSeats(createTripDto);
  }

  @Get()
  async findAll() {
    return this.tripsService.findAll();
  }

  @Get(':id/seats')
  async findSeats(@Param('id') id: string) {
    return this.tripsService.findSeats(id);
  }
}