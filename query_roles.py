import sqlite3
conn=sqlite3.connect('backend/prisma/dev.db')
cur=conn.cursor()
pids=['c011d1ac-82bf-4bee-88b0-ed44d3b3d4ca','1b2f6509-97fd-4427-8ebf-f15c47d1e383','df9a01c5-6591-479e-8abc-e92420eb78fc','759fbd45-f625-4bf3-b311-7595623d3fee','e2b43570-bed9-4c16-bec0-fdab74987c3a']

for pid in pids:
    cur.execute("SELECT name, email FROM people WHERE id=?;", (pid,))
    person=cur.fetchone()
    name=email=('??','??')
    if person:
        name, email=person
    roles=[]
    for table,label in [('students','ALUNO'),('teachers','PROFESSOR'),('guardians','RESPONSAVEL')]:
        cur.execute(f"SELECT id FROM {table} WHERE personId=?;", (pid,))
        if cur.fetchone():
            roles.append(label)
    if email and email.strip():
        cur.execute("SELECT id FROM users WHERE email=?;", (email,))
        if cur.fetchone():
            roles.append('USUÁRIO DO SISTEMA')
    if not roles:
        roles.append('SEM PAPEIS OPERACIONAIS')
    print(pid, name, email, roles)

cur.close()
conn.close()
