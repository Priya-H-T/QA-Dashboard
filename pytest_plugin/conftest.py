import os
import re
import json
import time
import html as html_lib
import tempfile
import pytest
import requests


REQUEST_TIMEOUT = 10  # seconds, so a hung dashboard can't stall the test run
UPLOAD_TIMEOUT = 60   # screenshots / HTML reports can be larger

# Status sent to the dashboard when a test fails during fixture setup
# (e.g. the browser failed to start). Change to "failed" if your API
# doesn't accept "error".
SETUP_FAILURE_STATUS = "error"


def _load_session_file():
    """
    The dashboard's "Run tests" (open IDE) button writes a one-time
    session file into this project's folder before launching the IDE,
    since IDE terminal panels don't reliably inherit the environment
    variables set on the process that launched them (confirmed: even a
    freshly-opened PyCharm showed an empty QA_DASHBOARD_TOKEN). If this
    file exists, its values take priority over env vars, and it's
    deleted immediately after reading so it's never reused stale.
    """
    session_path = os.path.join(os.getcwd(), ".qa_dashboard_session.json")
    if not os.path.exists(session_path):
        return None
    try:
        with open(session_path, "r") as f:
            data = json.load(f)
        os.remove(session_path)
        return data
    except Exception:
        return None


_session = _load_session_file()

API_BASE_URL = (_session or {}).get("api_url") or os.environ.get("QA_DASHBOARD_API_URL", "http://127.0.0.1:8000")
QA_USERNAME = os.environ.get("QA_DASHBOARD_USERNAME")
QA_PASSWORD = os.environ.get("QA_DASHBOARD_PASSWORD")
QA_PROJECT = (_session or {}).get("project") or os.environ.get("QA_DASHBOARD_PROJECT", os.path.basename(os.getcwd()))
_session_token = (_session or {}).get("token")

_run_id = None
_auth_headers = {}


CSS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report_style.css")


def pytest_configure(config):
    # Auto-generate a timestamped HTML report path, so no --html flag
    # needs to be remembered on every run. Skipped if pytest-html isn't
    # installed (the option wouldn't exist).
    if hasattr(config.option, "htmlpath") and not config.option.htmlpath:
        os.makedirs("reports", exist_ok=True)
        timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")
        config.option.htmlpath = os.path.join("reports", f"report_{timestamp}.html")
        config.option.self_contained_html = True


def _polish_report(report_path):
    """
    pytest-html 4.x's templating internals aren't reliably steerable via
    config options across versions, so instead we directly edit the
    finished HTML file: swap in a real title and inject our own <style>
    block matching the actual markup pytest-html generates.
    """
    try:
        with open(report_path, "r", encoding="utf-8") as f:
            content = f.read()

        nice_title = html_lib.escape(
            f"QA Automation Report \u2014 {QA_PROJECT} \u2014 {time.strftime('%Y-%m-%d %H:%M')}"
        )
        # Lambdas avoid regex-escape problems (backslashes etc.) in the replacement.
        content = re.sub(
            r'<title id="head-title">.*?</title>',
            lambda m: f'<title id="head-title">{nice_title}</title>',
            content,
            count=1,
        )
        content = re.sub(
            r'<h1 id="title">.*?</h1>',
            lambda m: f'<h1 id="title">{nice_title}</h1>',
            content,
            count=1,
        )

        if os.path.exists(CSS_PATH):
            with open(CSS_PATH, "r", encoding="utf-8") as f:
                custom_css = f.read()
            content = content.replace(
                "</head>",
                f"<style>{custom_css}</style>\n</head>",
            )

        with open(report_path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        print(f"\n[qa-dashboard] Failed to polish report styling: {e}")


def _login():
    token = _session_token or os.environ.get("QA_DASHBOARD_TOKEN")
    if token:
        return {"Authorization": f"Bearer {token}"}

    if not QA_USERNAME or not QA_PASSWORD:
        raise RuntimeError(
            "Either QA_DASHBOARD_TOKEN, or both QA_DASHBOARD_USERNAME and "
            "QA_DASHBOARD_PASSWORD, must be set so pytest can authenticate "
            "with the QA Dashboard API."
        )
    resp = requests.post(
        f"{API_BASE_URL}/auth/login",
        json={"username": QA_USERNAME, "password": QA_PASSWORD},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def pytest_sessionstart(session):
    global _run_id, _auth_headers
    # If the dashboard is unreachable or credentials are missing, tests
    # still run; reporting is simply disabled (every other hook returns
    # early when _run_id is None).
    try:
        _auth_headers = _login()
        resp = requests.post(
            f"{API_BASE_URL}/runs",
            json={
                "name": f"pytest run {time.strftime('%Y-%m-%d %H:%M:%S')}",
                "environment": os.environ.get("QA_DASHBOARD_ENV", "local"),
                "project": QA_PROJECT,
            },
            headers=_auth_headers,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        _run_id = resp.json()["run_id"]
    except Exception as e:
        _run_id = None
        print(f"\n[qa-dashboard] Reporting disabled: {e}")


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if _run_id is None:
        return

    # Report the test body, plus setup phases that failed or were skipped
    # (otherwise those tests would never show up on the dashboard).
    if report.when == "call":
        status = report.outcome
    elif report.when == "setup" and report.failed:
        status = SETUP_FAILURE_STATUS
    elif report.when == "setup" and report.skipped:
        status = "skipped"
    else:
        return

    failed = report.failed
    payload = {
        "name": item.nodeid,
        "suite": item.parent.name if item.parent else None,
        "status": status,
        "duration_seconds": report.duration,
        "error_message": str(report.longrepr) if failed else None,
        "stack_trace": str(report.longrepr) if failed else None,
    }

    try:
        resp = requests.post(
            f"{API_BASE_URL}/runs/{_run_id}/testcases",
            json=payload,
            headers=_auth_headers,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        test_case_id = resp.json()["test_case_id"]
    except Exception as e:
        print(f"\n[qa-dashboard] Failed to report test case '{item.nodeid}': {e}")
        return

    if failed:
        driver = item.funcargs.get("driver") or item.funcargs.get("page")
        if driver is not None:
            safe_name = re.sub(r"[^\w.\-]", "_", item.name)
            shot_path = os.path.join(tempfile.gettempdir(), f"{safe_name}.png")
            try:
                if hasattr(driver, "save_screenshot"):
                    driver.save_screenshot(shot_path)
                elif hasattr(driver, "screenshot"):
                    driver.screenshot(path=shot_path)

                with open(shot_path, "rb") as f:
                    resp = requests.post(
                        f"{API_BASE_URL}/testcases/{test_case_id}/screenshot",
                        files={"file": (f"{safe_name}.png", f, "image/png")},
                        headers=_auth_headers,
                        timeout=UPLOAD_TIMEOUT,
                    )
                    resp.raise_for_status()
            except Exception as e:
                print(f"\n[qa-dashboard] Failed to upload screenshot for '{item.nodeid}': {e}")


@pytest.hookimpl(trylast=True)
def pytest_sessionfinish(session, exitstatus):
    if _run_id is None:
        return

    try:
        resp = requests.post(
            f"{API_BASE_URL}/runs/{_run_id}/finish",
            headers=_auth_headers,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"\n[qa-dashboard] Failed to mark run finished: {e}")


def pytest_unconfigure(config):
    # pytest_unconfigure runs strictly after every sessionfinish hook,
    # including pytest-html's own file-writing hook, so by this point
    # the report file is guaranteed to actually exist on disk.
    if _run_id is None:
        return

    report_path = getattr(config.option, "htmlpath", None)
    if not report_path:
        return

    if not os.path.exists(report_path):
        print(f"\n[qa-dashboard] Expected report at {report_path} but it wasn't found.")
        return

    _polish_report(report_path)
    try:
        with open(report_path, "rb") as f:
            resp = requests.post(
                f"{API_BASE_URL}/runs/{_run_id}/report",
                files={"file": (os.path.basename(report_path), f, "text/html")},
                headers=_auth_headers,
                timeout=UPLOAD_TIMEOUT,
            )
            resp.raise_for_status()
        print(f"\n[qa-dashboard] Report uploaded for run {_run_id}")
    except Exception as e:
        print(f"\n[qa-dashboard] Failed to upload report: {e}")