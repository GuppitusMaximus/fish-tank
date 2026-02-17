#!/usr/bin/env python3
"""QA test for the-snake-tank/README.md accuracy.

Verifies that backend README documentation matches actual implementation:
- 6hrRC model is documented with correct feature dimensions
- SQLite dual-write is documented (predictions + prediction_history tables)
- Model type names are current (3hrRaw, 24hrRaw, 6hrRC)
- Project structure matches actual files
- Data retention changes are mentioned
"""

import json
import os
import re
import sqlite3
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(SCRIPT_DIR, "..", "the-snake-tank")
README_PATH = os.path.join(BACKEND_DIR, "README.md")
DB_PATH = os.path.join(BACKEND_DIR, "data", "weather.db")
MODELS_DIR = os.path.join(BACKEND_DIR, "models")


def read_readme():
    """Read README.md content."""
    with open(README_PATH) as f:
        return f.read()


def test_readme_exists():
    """README.md must exist."""
    assert os.path.exists(README_PATH), "README.md not found"
    print("✓ README.md exists")


def test_markdown_valid():
    """README must have valid markdown (no unclosed code blocks)."""
    content = read_readme()
    code_blocks = content.count("```")
    assert code_blocks % 2 == 0, f"Unclosed code blocks (found {code_blocks} delimiters)"
    print(f"✓ Markdown is valid ({code_blocks // 2} code blocks)")


def test_6hr_rc_model_documented():
    """6hrRC model must be documented as third model type."""
    content = read_readme()

    # Check for 6hrRC mentions
    assert "6hrRC" in content, "6hrRC model not mentioned"
    assert "6hr_rc_meta.json" in content, "6hr_rc_meta.json not in project structure"

    # Check for residual correction explanation
    assert "residual correction" in content.lower(), "Residual correction not explained"

    # Check for correct feature dimensions (72 base + 12 error lags + 2 averages)
    assert "72-dimensional" in content, "72-dimensional base feature vector not documented"

    # Verify the error lags breakdown
    assert "12 error lags" in content, "Error lags breakdown not documented"

    print("✓ 6hrRC model documented with correct feature dimensions")


def test_model_type_names_current():
    """Model type names must use current naming: 3hrRaw, 24hrRaw, 6hrRC."""
    content = read_readme()

    # Check for new names
    assert "3hrRaw" in content, "3hrRaw model name not found"
    assert "24hrRaw" in content, "24hrRaw model name not found"
    assert "6hrRC" in content, "6hrRC model name not found"

    # Check that model type references use new names, not old ones
    # We want to catch things like `--model-type simple` or `"simple"` as a model identifier
    # But allow descriptive uses like "full model" or "simple fallback"

    # Look for problematic patterns: model references that use old names
    problematic_patterns = [
        r'--model-type\s+(simple|full)',  # CLI args with old names
        r'model_type["\s:=]+(simple|full)',  # JSON/code with old names
        r'"(simple|full)"\s+model',  # "simple" model or "full" model
    ]

    issues = []
    for pattern in problematic_patterns:
        matches = re.finditer(pattern, content, re.IGNORECASE)
        for match in matches:
            issues.append(f"Found old model name in '{match.group(0)}'")

    assert not issues, f"Old model names used: {'; '.join(issues)}"

    print("✓ Model type names are current (3hrRaw, 24hrRaw, 6hrRC)")


def test_sqlite_dual_write_documented():
    """SQLite dual-write must be documented."""
    content = read_readme()

    # Check for predictions table mention
    assert "predictions" in content.lower() and "table" in content.lower(), \
        "predictions table not mentioned"

    # Check for prediction_history table mention
    assert "prediction_history" in content.lower() and "table" in content.lower(), \
        "prediction_history table not mentioned"

    # Check for dual-write explanation
    assert "weather.db" in content, "weather.db not mentioned"
    assert "dual-write" in content.lower() or "both json and sqlite" in content.lower(), \
        "Dual-write approach not explained"

    # Verify table schemas are documented
    assert "generated_at" in content, "predictions table schema not documented"
    assert "model_type" in content, "model_type column not documented"

    print("✓ SQLite dual-write documented (predictions + prediction_history tables)")


def test_data_retention_documented():
    """Data retention cleanup must be documented."""
    content = read_readme()

    # Check for retention policy mentions
    assert "48" in content and "hours" in content.lower(), \
        "48-hour prediction retention not mentioned"
    assert "7 days" in content.lower() or "7d" in content, \
        "7-day raw data retention not mentioned"

    # Check for cleanup explanation
    assert "cleanup" in content.lower() or "retention" in content.lower(), \
        "Data retention/cleanup not explained"

    print("✓ Data retention changes documented")


def test_gitignore_joblib_documented():
    """Must note that .joblib files are gitignored."""
    content = read_readme()

    assert "gitignored" in content.lower() or ".gitignore" in content.lower(), \
        ".joblib gitignore not mentioned"
    assert "joblib" in content.lower(), ".joblib files not mentioned"

    print("✓ .joblib gitignore documented")


def test_project_structure_accuracy():
    """Project structure listing must match actual files."""
    content = read_readme()

    # Extract file tree section
    tree_match = re.search(r'```\s*\nthe-snake-tank/\n(.*?)```', content, re.DOTALL)
    assert tree_match, "Project structure tree not found in README"

    tree_content = tree_match.group(1)

    # Check that key files are listed
    expected_files = [
        "fetch_weather.py",
        "build_dataset.py",
        "train_model.py",
        "predict.py",
        "validate_prediction.py",
        "export_weather.py",
        "export_workflow.py",
        "requirements.txt",
        "6hr_rc_meta.json",
        "model_meta.json",
        "simple_meta.json",
        "weather.db",
        "prediction-history.json",
    ]

    missing = []
    for fname in expected_files:
        if fname not in tree_content:
            missing.append(fname)

    assert not missing, f"Files missing from project structure: {missing}"

    # Verify actual files exist
    actual_files = os.listdir(BACKEND_DIR)
    for fname in ["fetch_weather.py", "build_dataset.py", "train_model.py", "predict.py"]:
        assert fname in actual_files, f"{fname} documented but not found in directory"

    print("✓ Project structure matches actual files")


def test_sqlite_tables_exist():
    """Verify that documented SQLite tables actually exist in schema."""
    if not os.path.exists(DB_PATH):
        print("⚠ weather.db not found, skipping table verification")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check for tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row[0] for row in cursor.fetchall()}

    expected_tables = {"readings", "predictions", "prediction_history"}
    missing_tables = expected_tables - tables

    conn.close()

    assert not missing_tables, f"Documented tables missing from DB: {missing_tables}"
    print(f"✓ SQLite tables exist: {', '.join(expected_tables)}")


def test_model_meta_files_documented():
    """Model metadata files must be documented in project structure."""
    content = read_readme()

    meta_files = ["model_meta.json", "simple_meta.json", "6hr_rc_meta.json"]
    for meta_file in meta_files:
        assert meta_file in content, f"{meta_file} not in project structure"

    # Verify they exist
    if os.path.exists(MODELS_DIR):
        actual_meta_files = [f for f in os.listdir(MODELS_DIR) if f.endswith("_meta.json")]
        for meta_file in meta_files:
            meta_path = os.path.join(MODELS_DIR, meta_file)
            if os.path.exists(meta_path):
                # Verify it's valid JSON
                with open(meta_path) as f:
                    meta = json.load(f)
                    assert "version" in meta, f"{meta_file} missing 'version' field"

    print("✓ Model metadata files documented and valid")


if __name__ == "__main__":
    tests = [
        test_readme_exists,
        test_markdown_valid,
        test_6hr_rc_model_documented,
        test_model_type_names_current,
        test_sqlite_dual_write_documented,
        test_data_retention_documented,
        test_gitignore_joblib_documented,
        test_project_structure_accuracy,
        test_sqlite_tables_exist,
        test_model_meta_files_documented,
    ]

    failed = []
    for test in tests:
        try:
            test()
        except AssertionError as e:
            print(f"✗ {test.__name__}: {e}")
            failed.append((test.__name__, str(e)))
        except Exception as e:
            print(f"✗ {test.__name__}: Unexpected error: {e}")
            failed.append((test.__name__, f"Unexpected error: {e}"))

    print()
    if failed:
        print(f"FAILED: {len(failed)} test(s) failed")
        for test_name, error in failed:
            print(f"  - {test_name}: {error}")
        sys.exit(1)
    else:
        print(f"PASSED: All {len(tests)} tests passed")
        sys.exit(0)
