const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const emailVariants = ['TCHAIPUA@GMAIL.COM','tchaipua@gmail.com','Tchaipua@gmail.com'];
  const [users, teachers, students, guardians] = await Promise.all([
    prisma.user.findMany({ where: { email: { in: emailVariants }, canceledAt: null }, include: { tenant: true } }),
    prisma.teacher.findMany({ where: { email: { in: emailVariants }, canceledAt: null }, include: { tenant: true } }),
    prisma.student.findMany({ where: { email: { in: emailVariants }, canceledAt: null }, include: { tenant: true } }),
    prisma.guardian.findMany({ where: { email: { in: emailVariants }, canceledAt: null }, include: { tenant: true } }),
  ]);
  console.log(JSON.stringify({ users, teachers, students, guardians }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); process.exit(1); });
