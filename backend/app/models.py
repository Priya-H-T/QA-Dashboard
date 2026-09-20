import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, ForeignKey, Enum, Boolean
)
from sqlalchemy.orm import relationship

from .database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class RunStatus(str, enum.Enum):
    in_progress = "in_progress"
    finished = "finished"


class TestStatus(str, enum.Enum):
    passed = "passed"
    failed = "failed"
    skipped = "skipped"


class Run(Base):
    __tablename__ = "runs"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=True)
    environment = Column(String, nullable=True)
    status = Column(Enum(RunStatus), default=RunStatus.in_progress, nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    report_path = Column(String, nullable=True)
    project = Column(String, nullable=True, index=True)

    test_cases = relationship(
        "TestCase", back_populates="run", cascade="all, delete-orphan"
    )
    creator = relationship("User")

    def counts(self):
        passed = sum(1 for t in self.test_cases if t.status == TestStatus.passed)
        failed = sum(1 for t in self.test_cases if t.status == TestStatus.failed)
        skipped = sum(1 for t in self.test_cases if t.status == TestStatus.skipped)
        return {"passed": passed, "failed": failed, "skipped": skipped, "total": len(self.test_cases)}


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(String, primary_key=True, default=gen_uuid)
    run_id = Column(String, ForeignKey("runs.id"), nullable=False)
    name = Column(String, nullable=False)
    suite = Column(String, nullable=True)
    status = Column(Enum(TestStatus), nullable=False)
    duration_seconds = Column(Float, nullable=True)
    error_message = Column(String, nullable=True)
    stack_trace = Column(String, nullable=True)
    screenshot_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    run = relationship("Run", back_populates="test_cases")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    password_salt = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)


class ProjectConfig(Base):
    __tablename__ = "project_configs"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, unique=True, nullable=False, index=True)
    project_type = Column(String, nullable=False, default="python")
    working_directory = Column(String, nullable=False)
    python_executable = Column(String, nullable=False, default="python")
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    creator = relationship("User")