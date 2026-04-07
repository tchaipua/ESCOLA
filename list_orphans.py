import sqlite3
conn=sqlite3.connect('backend/prisma/dev.db')
cur=conn.cursor()
cur.execute("SELECT id,name,email FROM people;")
orphans=[]
for pid,name,email in cur.fetchall():
    cur.execute("SELECT 1 FROM students WHERE personId=?",(pid,))
    if cur.fetchone(): continue
    cur.execute("SELECT 1 FROM teachers WHERE personId=?",(pid,))
    if cur.fetchone(): continue
    cur.execute("SELECT 1 FROM guardians WHERE personId=?",(pid,))
    if cur.fetchone(): continue
    if email:
        cur.execute("SELECT 1 FROM users WHERE email=?",(email,))
        if cur.fetchone():
            continue
    orphans.append((pid,name,email))
print('total without profile',len(orphans))
for pid,name,email in orphans:
    print(pid,name,email)
cur.close()
conn.close()
