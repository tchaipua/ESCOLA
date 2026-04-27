import sqlite3, uuid, datetime
conn=sqlite3.connect('backend/prisma/dev.db')
cur=conn.cursor()
person_id=str(uuid.uuid4())
student_id=str(uuid.uuid4())
now=datetime.datetime.utcnow().isoformat()
cur.execute("INSERT INTO people (id, tenantId, name, email, cpf, cpfDigits, createdAt, updatedAt, createdBy, updatedBy) VALUES (?,?,?,?,?,?,?,?,?,?);",(
    person_id,
    '2363aaf8-2d01-4ec6-b7f4-f6e92e41ebd9',
    'TESTE TCHA 07-04-2026',
    'teste.tcha07@gmail.com',
    '12345678901',
    '12345678901',
    now,
    now,
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000'
))
cur.execute("INSERT INTO students (id, tenantId, personId, name, birthDate, email, accessProfile, permissions, billingPayerType, createdAt, createdBy, updatedAt, updatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?);",(
    student_id,
    '2363aaf8-2d01-4ec6-b7f4-f6e92e41ebd9',
    person_id,
    'TESTE TCHA 07-04-2026',
    '2026-04-07',
    'teste.tcha07@gmail.com',
    'ALUNO_CONSULTA',
    '["VIEW_DASHBOARD"]',
    'ALUNO',
    now,
    '00000000-0000-0000-0000-000000000000',
    now,
    '00000000-0000-0000-0000-000000000000'
))
conn.commit()
print('person',person_id)
print('student',student_id)
cur.close();conn.close()
