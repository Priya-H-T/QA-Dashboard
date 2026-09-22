import os
import shutil
import uuid
import subprocess
import shlex
import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Header, Query
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .security import hash_password, verify_password, generate_token
from . import models, schemas
from .database import Base, engine, get_db
from .migrate import ensure_columns


Base.metadata.create_all(bind=engine)

ensure_columns(engine, "runs", {
    "created_by": "TEXT",
    "report_path": "TEXT",
    "project": "TEXT",
})
ensure_columns(engine, "users", {
    "role": "TEXT DEFAULT 'user'",
})
ensure_columns(engine, "project_configs", {
    "project_type": "TEXT DEFAULT 'python'",
})

SCREENSHOT_DIR = os.environ.get("QA_DASHBOARD_SCREENSHOT_DIR", "./screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

REPORT_DIR = os.environ.get("QA_DASHBOARD_REPORT_DIR", "./reports")
os.makedirs(REPORT_DIR, exist_ok=True)

app = FastAPI(title="QA Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSION_LIFETIME = timedelta(days=7)


def get_current_user(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.removeprefix("Bearer ")
    elif token:
        raw_token = token

    if not raw_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = db.query(models.Session).filter(models.Session.token == raw_token).first()
    if not session or session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Session expired or invalid")

    user = db.get(models.User, session.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _is_admin(user: models.User) -> bool:
    return user.role == "admin"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_salt, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = generate_token()
    session = models.Session(
        user_id=user.id,
        token=token,
        expires_at=datetime.utcnow() + SESSION_LIFETIME,
    )
    db.add(session)
    db.commit()
    return {"token": token}


@app.get("/auth/me", response_model=schemas.MeResponse)
def get_me(user: models.User = Depends(get_current_user)):
    return schemas.MeResponse(username=user.username, role=user.role)


@app.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return db.query(models.User).order_by(models.User.username).all()


@app.post("/users", response_model=schemas.UserOut)
def create_user_endpoint(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")

    role = payload.role if payload.role in ("user", "admin") else "user"
    existing = db.query(models.User).filter(models.User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="A user with this username already exists")

    salt, password_hash = hash_password(payload.password)
    new_user = models.User(
        username=payload.username,
        password_hash=password_hash,
        password_salt=salt,
        role=role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.post("/runs", response_model=dict)
def create_run(
    payload: schemas.RunCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    run = models.Run(
        name=payload.name, environment=payload.environment,
        project=payload.project, created_by=user.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return {"run_id": run.id}


@app.post("/runs/{run_id}/finish")
def finish_run(run_id: str, db: Session = Depends(get_db)):
    run = db.get(models.Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    run.status = models.RunStatus.finished
    run.finished_at = datetime.utcnow()
    db.commit()
    return {"status": "finished"}


@app.get("/runs", response_model=list[schemas.RunSummary])
def list_runs(
    project: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = db.query(models.Run)
    if not _is_admin(user):
        query = query.filter(models.Run.created_by == user.id)
    if project:
        query = query.filter(models.Run.project == project)
    runs = query.order_by(models.Run.started_at.desc()).all()

    out = []
    for r in runs:
        c = r.counts()
        out.append(schemas.RunSummary(
            id=r.id, name=r.name, environment=r.environment, status=r.status,
            started_at=r.started_at, finished_at=r.finished_at,
            passed=c["passed"], failed=c["failed"], skipped=c["skipped"], total=c["total"],
            created_by_username=r.creator.username if r.creator else None,
            has_report=bool(r.report_path),
            project=r.project,
        ))
    return out


@app.get("/runs/{run_id}", response_model=schemas.RunDetail)
def get_run(run_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    run = db.get(models.Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if not _is_admin(user) and run.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this run")

    suites: dict[str, list] = {}
    for tc in run.test_cases:
        suite_name = tc.suite or "Ungrouped"
        suites.setdefault(suite_name, []).append(schemas.TestCaseOut(
            id=tc.id, name=tc.name, suite=tc.suite, status=tc.status,
            duration_seconds=tc.duration_seconds, error_message=tc.error_message,
            stack_trace=tc.stack_trace, has_screenshot=bool(tc.screenshot_path),
            open_issue_count=sum(1 for i in tc.issues if i.status == "open"),
        ))

    return schemas.RunDetail(
        id=run.id, name=run.name, environment=run.environment, status=run.status,
        started_at=run.started_at, finished_at=run.finished_at,
        counts=run.counts(), suites=suites,
        created_by_username=run.creator.username if run.creator else None,
        has_report=bool(run.report_path),
        project=run.project,
    )


@app.get("/projects", response_model=list[schemas.ProjectSummary])
def list_projects(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    project_query = db.query(models.Run.project).filter(models.Run.project.isnot(None))
    if not _is_admin(user):
        project_query = project_query.filter(models.Run.created_by == user.id)
    names = sorted({r[0] for r in project_query.distinct().all()})

    summaries = []
    for name in names:
        runs_query = db.query(models.Run).filter(models.Run.project == name)
        if not _is_admin(user):
            runs_query = runs_query.filter(models.Run.created_by == user.id)
        runs = runs_query.all()

        passed = failed = skipped = 0
        for r in runs:
            c = r.counts()
            passed += c["passed"]
            failed += c["failed"]
            skipped += c["skipped"]
        last_run_at = max((r.started_at for r in runs), default=None)
        summaries.append(schemas.ProjectSummary(
            name=name, total_runs=len(runs), passed=passed, failed=failed,
            skipped=skipped, total_tests=passed + failed + skipped, last_run_at=last_run_at,
        ))
    return summaries


@app.post("/runs/{run_id}/testcases", response_model=dict)
def create_test_case(run_id: str, payload: schemas.TestCaseCreate, db: Session = Depends(get_db)):
    run = db.get(models.Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    tc = models.TestCase(
        run_id=run_id, name=payload.name, suite=payload.suite, status=payload.status,
        duration_seconds=payload.duration_seconds, error_message=payload.error_message,
        stack_trace=payload.stack_trace,
    )
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return {"test_case_id": tc.id}


@app.get("/testcases", response_model=list[schemas.TestCaseListItem])
def list_test_cases(
    status: Optional[models.TestStatus] = None,
    suite: Optional[str] = None,
    run_id: Optional[str] = None,
    project: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = db.query(models.TestCase).join(models.Run)
    if not _is_admin(user):
        query = query.filter(models.Run.created_by == user.id)
    if status:
        query = query.filter(models.TestCase.status == status)
    if suite:
        query = query.filter(models.TestCase.suite == suite)
    if run_id:
        query = query.filter(models.TestCase.run_id == run_id)
    if project:
        query = query.filter(models.Run.project == project)
    if search:
        query = query.filter(models.TestCase.name.ilike(f"%{search}%"))

    test_cases = query.order_by(models.Run.started_at.desc()).all()
    return [
        schemas.TestCaseListItem(
            id=tc.id,
            name=tc.name,
            suite=tc.suite,
            status=tc.status,
            duration_seconds=tc.duration_seconds,
            error_message=tc.error_message,
            has_screenshot=bool(tc.screenshot_path),
            run_id=tc.run_id,
            run_name=tc.run.name,
            run_started_at=tc.run.started_at,
            run_environment=tc.run.environment,
        )
        for tc in test_cases
    ]


@app.post("/testcases/{test_case_id}/screenshot")
def upload_screenshot(test_case_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    tc = db.get(models.TestCase, test_case_id)
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")

    ext = os.path.splitext(file.filename or "")[1] or ".png"
    filename = f"{uuid.uuid4()}{ext}"
    dest_path = os.path.join(SCREENSHOT_DIR, filename)

    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    tc.screenshot_path = dest_path
    db.commit()
    return {"status": "ok"}


@app.get("/testcases/{test_case_id}/screenshot")
def get_screenshot(test_case_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    tc = db.get(models.TestCase, test_case_id)
    if not tc or not tc.screenshot_path or not os.path.exists(tc.screenshot_path):
        raise HTTPException(status_code=404, detail="Screenshot not found")
    if not _is_admin(user) and tc.run.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this screenshot")
    return FileResponse(tc.screenshot_path)


@app.post("/testcases/{test_case_id}/issues", response_model=schemas.IssueOut)
def create_issue(
    test_case_id: str,
    payload: schemas.IssueCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    tc = db.get(models.TestCase, test_case_id)
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    if not _is_admin(user) and tc.run.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to file an issue on this test case")

    issue = models.Issue(
        test_case_id=test_case_id,
        title=payload.title,
        description=payload.description,
        created_by=user.id,
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return schemas.IssueOut(
        id=issue.id, test_case_id=issue.test_case_id, title=issue.title,
        description=issue.description, status=issue.status,
        created_by_username=issue.creator.username if issue.creator else None,
        created_at=issue.created_at,
    )


@app.get("/testcases/{test_case_id}/issues", response_model=list[schemas.IssueOut])
def list_issues_for_test_case(
    test_case_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    tc = db.get(models.TestCase, test_case_id)
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    if not _is_admin(user) and tc.run.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view issues on this test case")

    return [
        schemas.IssueOut(
            id=i.id, test_case_id=i.test_case_id, title=i.title,
            description=i.description, status=i.status,
            created_by_username=i.creator.username if i.creator else None,
            created_at=i.created_at,
        )
        for i in sorted(tc.issues, key=lambda x: x.created_at, reverse=True)
    ]


@app.put("/issues/{issue_id}", response_model=schemas.IssueOut)
def update_issue(
    issue_id: str,
    payload: schemas.IssueUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    issue = db.get(models.Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    if not _is_admin(user) and issue.test_case.run.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this issue")

    issue.status = payload.status
    db.commit()
    db.refresh(issue)
    return schemas.IssueOut(
        id=issue.id, test_case_id=issue.test_case_id, title=issue.title,
        description=issue.description, status=issue.status,
        created_by_username=issue.creator.username if issue.creator else None,
        created_at=issue.created_at,
    )


@app.delete("/issues/{issue_id}")
def delete_issue(
    issue_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    issue = db.get(models.Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    if not _is_admin(user) and issue.test_case.run.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this issue")

    db.delete(issue)
    db.commit()
    return {"status": "deleted"}


@app.post("/runs/{run_id}/report")
def upload_report(run_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    run = db.get(models.Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    filename = f"{uuid.uuid4()}.html"
    dest_path = os.path.join(REPORT_DIR, filename)

    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    run.report_path = dest_path
    db.commit()
    return {"status": "ok"}


@app.get("/runs/{run_id}/report")
def get_report(run_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    run = db.get(models.Run, run_id)
    if not run or not run.report_path or not os.path.exists(run.report_path):
        raise HTTPException(status_code=404, detail="Report not found")
    if not _is_admin(user) and run.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this report")
    return FileResponse(run.report_path, media_type="text/html")


@app.delete("/runs/{run_id}/report")
def delete_report(run_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    run = db.get(models.Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if not _is_admin(user) and run.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this report")

    if run.report_path and os.path.exists(run.report_path):
        os.remove(run.report_path)

    run.report_path = None
    db.commit()
    return {"status": "deleted"}


@app.post("/project-configs", response_model=schemas.ProjectConfigOut)
def create_project_config(
    payload: schemas.ProjectConfigCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    existing = db.query(models.ProjectConfig).filter(models.ProjectConfig.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="A project with this name already exists")

    config = models.ProjectConfig(
        name=payload.name,
        project_type=payload.project_type or "python",
        working_directory=payload.working_directory,
        python_executable=payload.python_executable or "python",
        created_by=user.id,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return schemas.ProjectConfigOut(
        id=config.id, name=config.name, project_type=config.project_type,
        working_directory=config.working_directory, python_executable=config.python_executable,
        created_by_username=config.creator.username if config.creator else None,
    )


@app.get("/project-configs", response_model=list[schemas.ProjectConfigOut])
def list_project_configs(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    # Project configs (working directory + venv) are shared infrastructure
    # registrations, not personal data like runs/reports — every logged-in
    # user can see and trigger any registered project.
    configs = db.query(models.ProjectConfig).order_by(models.ProjectConfig.name).all()
    return [
        schemas.ProjectConfigOut(
            id=c.id, name=c.name, project_type=c.project_type,
            working_directory=c.working_directory, python_executable=c.python_executable,
            created_by_username=c.creator.username if c.creator else None,
        )
        for c in configs
    ]


@app.delete("/project-configs/{config_id}")
def delete_project_config(
    config_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    # Deleting the config just removes the registration (and the "Run
    # tests" button that goes with it) — it doesn't touch any runs
    # already reported under that project name.
    config = db.get(models.ProjectConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Project config not found")

    db.delete(config)
    db.commit()
    return {"status": "deleted"}


@app.delete("/projects/{project_name}")
def delete_project_completely(
    project_name: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    # Wipes everything tied to this project name: every run, their test
    # cases (cascades automatically), screenshots and reports on disk,
    # and the registered config if one exists — even for project names
    # that were only ever tagged by runs and never formally registered.
    runs = db.query(models.Run).filter(models.Run.project == project_name).all()
    for run in runs:
        for tc in run.test_cases:
            if tc.screenshot_path and os.path.exists(tc.screenshot_path):
                os.remove(tc.screenshot_path)
        if run.report_path and os.path.exists(run.report_path):
            os.remove(run.report_path)
        db.delete(run)

    config = db.query(models.ProjectConfig).filter(models.ProjectConfig.name == project_name).first()
    if config:
        db.delete(config)

    db.commit()
    return {"status": "deleted", "runs_deleted": len(runs)}


@app.post("/project-configs/{config_id}/trigger")
def trigger_project_run(
    config_id: str,
    payload: schemas.TriggerRunRequest = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    config = db.get(models.ProjectConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Project config not found")

    if not os.path.isdir(config.working_directory):
        raise HTTPException(status_code=400, detail=f"Working directory not found: {config.working_directory}")

    token = generate_token()
    session = models.Session(
        user_id=user.id,
        token=token,
        expires_at=datetime.utcnow() + timedelta(hours=6),
    )
    db.add(session)
    db.commit()

    env = os.environ.copy()
    env["QA_DASHBOARD_TOKEN"] = token
    env["QA_DASHBOARD_API_URL"] = "http://127.0.0.1:8000"
    env["QA_DASHBOARD_PROJECT"] = config.name

    # PyCharm's/IntelliJ's terminal panel does NOT reliably inherit the
    # environment we set on the launched process (confirmed: even a
    # freshly-opened instance showed the token as empty in its terminal).
    # Write a one-time session file into the project directory instead —
    # conftest.py reads and deletes it, sidestepping IDE env quirks
    # entirely.
    session_file_path = os.path.join(config.working_directory, ".qa_dashboard_session.json")
    try:
        with open(session_file_path, "w") as f:
            json.dump({
                "token": token,
                "project": config.name,
                "api_url": "http://127.0.0.1:8000",
            }, f)
    except OSError:
        pass  # working directory not writable — fall back to env vars only

    # We can't script a JetBrains IDE to click "Run" on a specific test —
    # there's no public CLI for that. Instead, open the right IDE on the
    # project directory; the person runs the test themselves from inside
    # the IDE, and the session file above (or env vars, as a fallback)
    # let results still report back to this dashboard.
    # `where pycharm` / `where idea` weren't resolving via PATH even after
    # confirming the .bat files exist and PATH is set correctly — rather
    # than keep fighting Windows PATH resolution, call the launcher by its
    # full path directly. Override via env var if paths differ on another
    # machine.
    default_pycharm = r"C:\Program Files\JetBrains\PyCharm Community Edition 2025.2.6\bin\pycharm.bat"
    default_idea = r"C:\Program Files\JetBrains\IntelliJ IDEA 2026.1.3\bin\idea.bat"
    ide_command = os.environ.get(
        "QA_DASHBOARD_PYCHARM_PATH" if config.project_type == "python" else "QA_DASHBOARD_IDEA_PATH",
        default_pycharm if config.project_type == "python" else default_idea,
    )

    try:
        subprocess.Popen([ide_command, config.working_directory], env=env)
    except FileNotFoundError:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Could not find the IDE launcher at '{ide_command}'. Set "
                f"QA_DASHBOARD_PYCHARM_PATH or QA_DASHBOARD_IDEA_PATH to the correct "
                f".bat file path if your install location differs."
            ),
        )

    return {"status": "started"}