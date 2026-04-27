import sqlite3
conn=sqlite3.connect('backend/prisma/dev.db')
for table in ['students','teachers','guardians','users']:
    cur=conn.cursor()
    cur.execute(f"PRAGMA table_info({table});")
    cols=[row[1] for row in cur.fetchall()]
    print(table, cols)
    cur.close()
conn.close()
