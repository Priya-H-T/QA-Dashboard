import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Anchor the database file to the project root (this file lives at
# backend/app/database.py, so three levels up is the root), regardless
# of what directory a command happens to be run from. This is what
# prevents stray duplicate .db files from silently being created when
# uvicorn, create_user.py, etc. are launched from different folders.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = PROJECT_ROOT / "qa_dashboard.db"

DATABASE_URL = os.environ.get("QA_DASHBOARD_DB_URL", f"sqlite:///{DB_PATH.as_posix()}")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()