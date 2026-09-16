"""
Usage (run from the project root, with venv activated):
    python -m backend.app.create_user <username> <password> [role]

    role defaults to "user". Pass "admin" to create an admin account,
    e.g.:
        python -m backend.app.create_user admin@yutitech.in secretpass admin
"""
import sys

from .database import SessionLocal, Base, engine
from . import models
from .security import hash_password


def create_user(username: str, password: str, role: str = "user"):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.username == username).first()
        if existing:
            print(f"User '{username}' already exists.")
            return
        salt, password_hash = hash_password(password)
        user = models.User(
            username=username, password_hash=password_hash, password_salt=salt, role=role,
        )
        db.add(user)
        db.commit()
        print(f"Created {role} user '{username}'.")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        print("Usage: python -m backend.app.create_user <username> <password> [role]")
        sys.exit(1)
    role_arg = sys.argv[3] if len(sys.argv) == 4 else "user"
    if role_arg not in ("user", "admin"):
        print("role must be 'user' or 'admin'")
        sys.exit(1)
    create_user(sys.argv[1], sys.argv[2], role_arg)