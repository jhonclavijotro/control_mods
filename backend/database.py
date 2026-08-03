import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Database path setup - default to data/solar_farm.db for persistent Docker volume
DATA_DIR = os.getenv("DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data"))
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "solar_farm.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def auto_migrate_db_schema():
    """Auto-migrate SQLite database tables to ensure missing columns are added automatically."""
    import sqlite3
    if not os.path.exists(DB_PATH):
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Migrate repair_logs
        cursor.execute("PRAGMA table_info(repair_logs)")
        rep_cols = [row[1] for row in cursor.fetchall()]
        if rep_cols:
            if "attachment_path" not in rep_cols:
                cursor.execute("ALTER TABLE repair_logs ADD COLUMN attachment_path TEXT")
            if "attachment_name" not in rep_cols:
                cursor.execute("ALTER TABLE repair_logs ADD COLUMN attachment_name TEXT")

        # Migrate replacement_logs
        cursor.execute("PRAGMA table_info(replacement_logs)")
        repl_cols = [row[1] for row in cursor.fetchall()]
        if repl_cols:
            if "attachment_path" not in repl_cols:
                cursor.execute("ALTER TABLE replacement_logs ADD COLUMN attachment_path TEXT")
            if "attachment_name" not in repl_cols:
                cursor.execute("ALTER TABLE replacement_logs ADD COLUMN attachment_name TEXT")

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Warning during automatic DB schema migration: {e}")
