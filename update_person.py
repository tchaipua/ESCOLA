import sqlite3
conn=sqlite3.connect('backend/prisma/dev.db')
cur=conn.cursor()
cur.execute("UPDATE students SET personId='1b2f6509-97fd-4427-8ebf-f15c47d1e383' WHERE id='668db9ce-373f-48d0-b4e4-aa5eef05362e';")
conn.commit()
cur.execute("SELECT personId FROM students WHERE id='668db9ce-373f-48d0-b4e4-aa5eef05362e';")
print(cur.fetchone())
cur.close()
conn.close()
