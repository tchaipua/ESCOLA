const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const email = 'TCHAIPUA@GMAIL.COM';
  const users = await prisma.user.findMany({ where: { email, canceledAt: null }, select: { id: true, tenantId: true, name: true, role: true, email: true } });
  const teachers = await prisma.teacher.findMany({ where: { email: { in: [email, email.toLowerCase()] }, canceledAt: null }, select: { id: true, tenantId: true, name: true, email: true } });
  const guardians = await prisma.guardian.findMany({ where: { email: { in: [email, email.toLowerCase()] }, canceledAt: null }, select: { id: true, tenantId: true, name: true, email: true } });
  console.log(JSON.stringify({ users, teachers, guardians }, null, 2));
  await prisma.$disconnect();
})();
