"""Tests for the upload_to_r2 function in export_weather.py."""
import ast
import os

EXPORT_PATH = os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank', 'export_weather.py')


def _read_source():
    with open(EXPORT_PATH) as f:
        return f.read()


def _get_function_source(source, func_name):
    """Extract source lines for a top-level function."""
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == func_name:
            lines = source.splitlines()
            return '\n'.join(lines[node.lineno - 1:node.end_lineno])
    return None


def test_function_exists():
    """upload_to_r2(file_path, object_key) is defined in export_weather.py."""
    source = _read_source()
    tree = ast.parse(source)
    func_names = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
    assert 'upload_to_r2' in func_names, "upload_to_r2 not defined in export_weather.py"

    # Check it has the right parameter names
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == 'upload_to_r2':
            args = [a.arg for a in node.args.args]
            assert 'file_path' in args, f"upload_to_r2 missing 'file_path' param, got {args}"
            assert 'object_key' in args, f"upload_to_r2 missing 'object_key' param, got {args}"


def test_uses_boto3():
    """upload_to_r2 imports and calls boto3.client('s3', ...)."""
    func_src = _get_function_source(_read_source(), 'upload_to_r2')
    assert func_src is not None, "upload_to_r2 not found"
    assert 'boto3' in func_src, "upload_to_r2 does not reference boto3"
    assert "boto3.client" in func_src, "upload_to_r2 does not call boto3.client"
    assert "'s3'" in func_src or '"s3"' in func_src, "boto3.client not called with 's3'"


def test_reads_env_vars():
    """upload_to_r2 reads R2 credentials from environment variables."""
    func_src = _get_function_source(_read_source(), 'upload_to_r2')
    assert func_src is not None, "upload_to_r2 not found"
    for var in ['R2_ENDPOINT_URL', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']:
        assert var in func_src, f"upload_to_r2 does not read env var {var}"


def test_graceful_skip_when_env_not_set():
    """upload_to_r2 has an early return when env vars are missing (no upload attempt)."""
    # Verify via AST that the function checks env vars and returns early before calling s3.upload_file
    func_src = _get_function_source(_read_source(), 'upload_to_r2')
    assert func_src is not None, "upload_to_r2 not found"

    # The function must have a return statement guarded by env var check
    # Check that the source contains the pattern: if not all([...]) + return
    assert 'if not all(' in func_src or 'if not all([' in func_src, \
        "upload_to_r2 does not check all env vars before proceeding"

    # Verify there is a bare 'return' (early exit) in the function
    tree = ast.parse(func_src)
    returns = [n for n in ast.walk(tree) if isinstance(n, ast.Return) and n.value is None]
    assert returns, "upload_to_r2 has no early return (bare return) for missing env vars"


def test_error_handling():
    """upload_to_r2 has try/except around the upload call."""
    func_src = _get_function_source(_read_source(), 'upload_to_r2')
    assert func_src is not None, "upload_to_r2 not found"
    assert 'try:' in func_src, "upload_to_r2 has no try/except block"
    assert 'except' in func_src, "upload_to_r2 has no except clause"


def test_content_type_json():
    """upload_to_r2 sets ContentType application/json for .json files."""
    func_src = _get_function_source(_read_source(), 'upload_to_r2')
    assert func_src is not None
    assert 'application/json' in func_src, "upload_to_r2 does not set ContentType application/json"


def test_content_type_gzip():
    """upload_to_r2 sets ContentType application/gzip for non-json files."""
    func_src = _get_function_source(_read_source(), 'upload_to_r2')
    assert func_src is not None
    assert 'application/gzip' in func_src, "upload_to_r2 does not set ContentType application/gzip"
