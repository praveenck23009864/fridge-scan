
import sqlite3

db = sqlite3.connect("fridge_scan.db")

tables = db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
).fetchall()

print("Fridge Scan Database Tables:")
print("----------------------------")

if tables:
    for table in tables:
        print("✅", table[0])
else:
    print("No tables found.")

db.close()
