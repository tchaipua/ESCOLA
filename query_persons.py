import sqlite3
conn=sqlite3.connect('backend/prisma/dev.db')
cur=conn.cursor()
cur.execute("SELECT id,name,email,phone,tenantId FROM people WHERE name LIKE '%MARÇAL SACCARDO FILHO%';")
for row in cur.fetchall():
    print(row)
cur.close()
conn.close()
