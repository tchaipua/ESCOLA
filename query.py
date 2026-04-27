import sqlite3
conn = sqlite3.connect('backend/prisma/dev.db')
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
print('tables:', cur.fetchall())
cur.execute("SELECT id,name,cpf,email FROM people WHERE name LIKE '%MARÇAL%';")
people = cur.fetchall()
print('results count', len(people))
for row in people:
    print(row)
cur.close()
conn.close()
