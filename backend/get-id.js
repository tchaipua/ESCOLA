const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenant = await prisma.tenant.findFirst();
    console.log(tenant ? tenant.id : 'NENHUM INQUILINO ENCONTRADO');
}

main().finally(() => prisma.$disconnect());
