import os
import time
import tempfile
import pytest
import requests

API_BASE_URL = os.environ.get("QA_DASHBOARD_API_URL", "http://127.0.0.1:8000")
QA_USERNAME = os.environ.get("QA_DASHBOARD_USERNAME")
QA_PASSWORD = os.environ.get("QA_DASHBOARD_PASSWORD")
QA_PROJECT = os.environ.get("QA_DASHBOARD_PROJECT", os.path.basename(os.getcwd()))

_run_id = None
_auth_headers = {}


def pytest_configure(config):
    # Auto-generate a timestamped HTML report path, so no --html flag
    # needs to be remembered on every run.
    if not config.option.htmlpath:
        os.makedirs("reports", exist_ok=True)
        timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")
        config.option.htmlpath = os.path.join("reports", f"report_{timestamp}.html")
        config.option.self_contained_html = True


def _login():
    if not QA_USERNAME or not QA_PASSWORD:
        raise RuntimeError(
            "QA_DASHBOARD_USERNAME and QA_DASHBOARD_PASSWORD environment variables "
            "must be set so pytest can authenticate with the QA Dashboard API."
        )
    resp = requests.post(f"{API_BASE_URL}/auth/login", json={
        "username": QA_USERNAME,
        "password": QA_PASSWORD,
    })
    resp.raise_for_status()
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def pytest_sessionstart(session):
    global _run_id, _auth_headers
    _auth_headers = _login()

    resp = requests.post(
        f"{API_BASE_URL}/runs",
        json={
            "name": f"pytest run {time.strftime('%Y-%m-%d %H:%M:%S')}",
            "environment": os.environ.get("QA_DASHBOARD_ENV", "local"),
            "project": QA_PROJECT,
        },
        headers=_auth_headers,
    )
    resp.raise_for_status()
    _run_id = resp.json()["run_id"]


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.when != "call" or _run_id is None:
        return

    payload = {
        "name": item.nodeid,
        "suite": item.parent.name if item.parent else None,
        "status": report.outcome,
        "duration_seconds": report.duration,
        "error_message": str(report.longrepr) if report.failed else None,
        "stack_trace": str(report.longrepr) if report.failed else None,
    }

    try:
        resp = requests.post(f"{API_BASE_URL}/runs/{_run_id}/testcases", json=payload)
        resp.raise_for_status()
        test_case_id = resp.json()["test_case_id"]
    except Exception as e:
        print(f"\n[qa-dashboard] Failed to report test case '{item.nodeid}': {e}")
        return

    if report.failed:
        driver = item.funcargs.get("driver") or item.funcargs.get("page")
        if driver is not None:
            shot_path = os.path.join(tempfile.gettempdir(), f"{item.name}.png")
            try:
                if hasattr(driver, "save_screenshot"):
                    driver.save_screenshot(shot_path)
                elif hasattr(driver, "screenshot"):
                    driver.screenshot(path=shot_path)

                with open(shot_path, "rb") as f:
                    requests.post(
                        f"{API_BASE_URL}/testcases/{test_case_id}/screenshot",
                        files={"file": (f"{item.name}.png", f, "image/png")},
                    )
            except Exception as e:
                print(f"\n[qa-dashboard] Failed to upload screenshot for '{item.nodeid}': {e}")


@pytest.hookimpl(trylast=True)
def pytest_sessionfinish(session, exitstatus):
    if _run_id is None:
        return

    try:
        resp = requests.post(f"{API_BASE_URL}/runs/{_run_id}/finish")
        resp.raise_for_status()
    except Exception as e:
        print(f"\n[qa-dashboard] Failed to mark run finished: {e}")

    report_path = session.config.option.htmlpath
    if report_path and os.path.exists(report_path):
        try:
            with open(report_path, "rb") as f:
                resp = requests.post(
                    f"{API_BASE_URL}/runs/{_run_id}/report",
                    files={"file": (os.path.basename(report_path), f, "text/html")},
                )
                resp.raise_for_status()
            print(f"\n[qa-dashboard] Report uploaded for run {_run_id}")
        except Exception as e:
            print(f"\n[qa-dashboard] Failed to upload report: {e}")