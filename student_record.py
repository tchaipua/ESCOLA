import sqlite3
conn=sqlite3.connect('backend/prisma/dev.db')
cur=conn.cursor()
cur.execute("SELECT * FROM students WHERE id='668db9ce-373f-48d0-b4e4-aa5eef05362e';")
import itertools
rows=cur.fetchall()
print(rows)
cur.close()
conn.close()
