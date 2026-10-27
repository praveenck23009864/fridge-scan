
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv(Path(__file__).resolve().with_name('.env'))
DATABASE_URL = os.getenv(
    "DATABASE_URL", f"sqlite:///{Path(__file__).resolve().with_name('fridge_scan.db').as_posix()}"
)


engine_options = {}

if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {
        "check_same_thread": False
    }

engine = create_engine(
    DATABASE_URL,
    **engine_options
)


@event.listens_for(engine, "connect")
def enable_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

class Base(DeclarativeBase):
    pass


def initialize_database(bind=engine):
    """Create missing tables and add review metadata without replacing user data."""
    Base.metadata.create_all(bind=bind)
    additions = {
        "scans": {
            "is_mock": "BOOLEAN NOT NULL DEFAULT 0",
            "model_used": "VARCHAR",
        },
        "shopping_lists": {"source_scan_id": "INTEGER REFERENCES scans(id)"},
    }
    with bind.begin() as connection:
        for table, columns in additions.items():
            existing = {c['name'] for c in inspect(connection).get_columns(table)}
            for name, sql_type in columns.items():
                if name not in existing:
                    connection.execute(text(f'ALTER TABLE {table} ADD COLUMN {name} {sql_type}'))
        connection.execute(text(
            'CREATE UNIQUE INDEX IF NOT EXISTS ix_shopping_lists_source_scan '
            'ON shopping_lists (source_scan_id)'
        ))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
