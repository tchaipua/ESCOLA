import sqlite3
conn=sqlite3.connect('backend/prisma/dev.db')
cur=conn.cursor()
deleted=[]
for pid in ['c011d1ac-82bf-4bee-88b0-ed44d3b3d4ca','df9a01c5-6591-479e-8abc-e92420eb78fc','759fbd45-f625-4bf3-b311-7595623d3fee','e2b43570-bed9-4c16-bec0-fdab74987c3a']:
    cur.execute("DELETE FROM people WHERE id=?",(pid,))
    deleted.append(cur.rowcount)
conn.commit()
print('deleted rows',deleted)
cur.close()
conn.close()
