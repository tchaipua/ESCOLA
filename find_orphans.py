import sqlite3
conn=sqlite3.connect('backend/prisma/dev.db')
cur=conn.cursor()
rows=cur.execute("SELECT id,name FROM people WHERE name='MARÇAL SACCARDO FILHO';").fetchall()
print('found',len(rows))
res=[]
for pid,name in rows:
    cur.execute("SELECT 1 FROM students WHERE personId=?",(pid,))
    if cur.fetchone():
        continue
    cur.execute("SELECT 1 FROM teachers WHERE personId=?",(pid,))
    if cur.fetchone():
        continue
    cur.execute("SELECT 1 FROM guardians WHERE personId=?",(pid,))
    if cur.fetchone():
        continue
    res.append(pid)
print('orphans',len(res))
print('\n'.join(res))
cur.close()
conn.close()
