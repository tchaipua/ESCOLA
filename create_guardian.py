import sqlite3, uuid, datetime
conn=sqlite3.connect('backend/prisma/dev.db')
cur=conn.cursor()
pid='0d7aed2f-dc1a-437e-be1c-9a1aa423759d'
cur.execute("SELECT 1 FROM guardians WHERE personId=?",(pid,))
if cur.fetchone():
    print('guardian already exists')
else:
    gid=str(uuid.uuid4())
    now=datetime.datetime.utcnow().replace(microsecond=0).isoformat()
    cur.execute("INSERT INTO guardians (id, tenantId, personId, name, email, accessProfile, permissions, createdAt, createdBy, updatedAt, updatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?)",(
        gid,
        '2363aaf8-2d01-4ec6-b7f4-f6e92e41ebd9',
        pid,
        'ADMIN TCHA',
        'TCHAIPUA@GMAIL.COM',
        'RESPONSAVEL_MASTER',
        '["VIEW_DASHBOARD","VIEW_GUARDIAN_BASIC_DATA","VIEW_GUARDIAN_CONTACT_DATA","VIEW_GUARDIAN_ACCESS_DATA"]',
        now,
        '00000000-0000-0000-0000-000000000000',
        now,
        '00000000-0000-0000-0000-000000000000'
    ))
    conn.commit()
    print('guardian inserted', gid)
cur.close()
conn.close()
