import sqlite3

db = sqlite3.connect("fridge_scan.db")

for table in ["shopping_lists", "shopping_list_items"]:
    print(f"\nTable: {table}")

    columns = db.execute(
        f"PRAGMA table_info({table})"
    ).fetchall()

    for column in columns:
        print(
            f"Column: {column[1]}, "
            f"Type: {column[2]}, "
            f"Required: {column[3]}"
        )

db.close()
