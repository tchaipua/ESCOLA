import sqlite3
conn = sqlite3.connect('backend/prisma/dev.db')
cur = conn.cursor()
cur.execute("SELECT p.id,p.name,p.email,p.cpfdigits,p.tenantId,t.name FROM people p JOIN tenants t ON p.tenantId = t.id WHERE p.name LIKE '%MARÇAL SACCARDO FILHO%';")
for row in cur.fetchall():
    print(row)
cur.close()
conn.close()
