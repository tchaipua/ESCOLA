import sqlite3
conn=sqlite3.connect('backend/prisma/dev.db')
cur=conn.cursor()
cur.execute("SELECT id,name,email FROM people WHERE email='TCHAIPUA@GMAIL.COM';")
print(cur.fetchall())
cur.close()
conn.close()
