import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

interface FindOrCreateInput {
  googleId: string;
  email: string;
  name: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(data: FindOrCreateInput) {
    const existing = await this.prisma.user.findUnique({
      where: { googleId: data.googleId },
    });

    if (existing) return existing;

    const adminEmail = process.env.ADMIN_SEED_EMAIL;
    const role: Role = data.email === adminEmail ? 'ADMIN' : 'PASSENGER';

    return this.prisma.user.create({
      data: { ...data, role },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateProfile(id: string, data: { name?: string; phone?: string; cpf?: string }) {
    return this.prisma.user.update({ where: { id }, data });
  }
}
