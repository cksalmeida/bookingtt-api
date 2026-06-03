import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_SEED_EMAIL;
  if (!adminEmail) throw new Error('ADMIN_SEED_EMAIL não definido no .env');

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log(`Admin já existe: ${adminEmail}`);
    return;
  }

  // googleId placeholder — será sobrescrito no primeiro login via Google OAuth
  await prisma.user.create({
    data: {
      googleId: `seed-${adminEmail}`,
      email: adminEmail,
      name: 'Admin',
      role: 'ADMIN',
    },
  });

  console.log(`Admin criado: ${adminEmail}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
