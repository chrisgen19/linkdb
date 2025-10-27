import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create a default user
  const hashedPassword = await bcrypt.hash('password123', 10);

  const defaultUser = await prisma.user.upsert({
    where: { email: 'admin@linkdb.com' },
    update: {},
    create: {
      email: 'admin@linkdb.com',
      password: hashedPassword,
      name: 'Admin User',
    },
  });

  console.log('Default user created:', defaultUser.email);

  // Update all existing links to belong to the default user
  const result = await prisma.link.updateMany({
    where: {
      userId: null,
    },
    data: {
      userId: defaultUser.id,
    },
  });

  console.log(`Updated ${result.count} links to belong to default user`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
