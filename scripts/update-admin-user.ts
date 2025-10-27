import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Hash the new password
  const hashedPassword = await bcrypt.hash('zxczxc123', 10);

  // Update the admin user
  const updatedUser = await prisma.user.update({
    where: { email: 'admin@linkdb.com' },
    data: {
      email: 'chrisgen19@gmail.com',
      password: hashedPassword,
    },
  });

  console.log('User updated successfully:', updatedUser.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
