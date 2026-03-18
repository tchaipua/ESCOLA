const jwt = require('jsonwebtoken');
const token = jwt.sign({ userId: 'ea407d51-d4f6-4571-af3f-188ebf64b2a1', tenantId: '2363aaf8-2d01-4ec6-b7f4-f6e92e41ebd9', role: 'PROFESSOR' }, 'super-secret-escolar-key-2026');
console.log(token);
