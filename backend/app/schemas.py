from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict

from .models import RunStatus, TestStatus


class RunCreate(BaseModel):
    name: Optional[str] = None
    environment: Optional[str] = None
    project: Optional[str] = None


class RunSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: Optional[str]
    environment: Optional[str]
    status: RunStatus
    started_at: datetime
    finished_at: Optional[datetime]
    passed: int
    failed: int
    skipped: int
    total: int
    created_by_username: Optional[str] = None
    has_report: bool = False
    project: Optional[str] = None


class TestCaseCreate(BaseModel):
    name: str
    suite: Optional[str] = None
    status: TestStatus
    duration_seconds: Optional[float] = None
    error_message: Optional[str] = None
    stack_trace: Optional[str] = None


class TestCaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    suite: Optional[str]
    status: TestStatus
    duration_seconds: Optional[float]
    error_message: Optional[str]
    stack_trace: Optional[str]
    has_screenshot: bool


class RunDetail(BaseModel):
    id: str
    name: Optional[str]
    environment: Optional[str]
    status: RunStatus
    started_at: datetime
    finished_at: Optional[datetime]
    counts: dict
    suites: dict
    created_by_username: Optional[str] = None
    has_report: bool = False
    project: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str


class TestCaseListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    suite: Optional[str]
    status: TestStatus
    duration_seconds: Optional[float]
    error_message: Optional[str]
    has_screenshot: bool
    run_id: str
    run_name: Optional[str]
    run_started_at: datetime
    run_environment: Optional[str] = None


class ProjectSummary(BaseModel):
    name: str
    total_runs: int
    passed: int
    failed: int
    skipped: int
    total_tests: int
    last_run_at: Optional[datetime]


class ProjectConfigCreate(BaseModel):
    name: str
    working_directory: str
    project_type: Optional[str] = "python"
    python_executable: Optional[str] = "python"


class ProjectConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    working_directory: str
    project_type: str
    python_executable: str


class TriggerRunRequest(BaseModel):
    test_path: Optional[str] = None



class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    role: str
    created_at: datetime


class MeResponse(BaseModel):
    username: str
    role: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: Optional[str] = "user"