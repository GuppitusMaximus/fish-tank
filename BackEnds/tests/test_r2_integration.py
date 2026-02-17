"""Tests verifying R2 upload calls in the export() function."""
import ast
import os

EXPORT_PATH = os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank', 'export_weather.py')


def _read_source():
    with open(EXPORT_PATH) as f:
        return f.read()


def _get_export_function_node(source):
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == 'export':
            return node
    return None


def _find_upload_calls(func_node):
    """Return list of (lineno, args) for each upload_to_r2 call in the function."""
    calls = []
    for node in ast.walk(func_node):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id == 'upload_to_r2':
                args = []
                for arg in node.args:
                    if isinstance(arg, ast.Constant):
                        args.append(arg.value)
                    elif isinstance(arg, ast.Name):
                        args.append(arg.id)
                    else:
                        args.append(ast.dump(arg))
                calls.append((node.lineno, args))
    return calls


def test_weather_json_uploaded():
    """export() calls upload_to_r2 with 'weather.json' as the object key."""
    source = _read_source()
    func_node = _get_export_function_node(source)
    assert func_node is not None, "export() not found"

    calls = _find_upload_calls(func_node)
    object_keys = [args[1] for _, args in calls if len(args) >= 2]
    assert 'weather.json' in object_keys, \
        f"upload_to_r2 not called with 'weather.json'. Calls: {calls}"


def test_frontend_db_gz_uploaded():
    """export() calls upload_to_r2 with 'frontend.db.gz' as the object key."""
    source = _read_source()
    func_node = _get_export_function_node(source)
    assert func_node is not None, "export() not found"

    calls = _find_upload_calls(func_node)
    object_keys = [args[1] for _, args in calls if len(args) >= 2]
    assert 'frontend.db.gz' in object_keys, \
        f"upload_to_r2 not called with 'frontend.db.gz'. Calls: {calls}"


def test_upload_after_write():
    """R2 upload calls appear AFTER the local file write, not before."""
    source = _read_source()
    func_node = _get_export_function_node(source)
    assert func_node is not None, "export() not found"

    upload_calls = _find_upload_calls(func_node)
    assert len(upload_calls) >= 2, f"Expected at least 2 upload_to_r2 calls, found {len(upload_calls)}"

    # Find the os.replace calls (atomic write pattern) in the export function
    replace_lines = []
    for node in ast.walk(func_node):
        if isinstance(node, ast.Call):
            func = node.func
            if (isinstance(func, ast.Attribute) and func.attr == 'replace'
                    and isinstance(func.value, ast.Name) and func.value.id == 'os'):
                replace_lines.append(node.lineno)

    assert replace_lines, "No os.replace() calls found in export() — atomic write not detected"

    # Every upload call should come after at least one os.replace
    last_replace = max(replace_lines)
    for lineno, args in upload_calls:
        assert lineno > last_replace or len(replace_lines) > 1, \
            f"upload_to_r2 call at line {lineno} may be before file write (last os.replace at {last_replace})"

    # More precise check: weather.json upload should come after the first os.replace
    weather_upload_lines = [lineno for lineno, args in upload_calls
                            if len(args) >= 2 and args[1] == 'weather.json']
    db_upload_lines = [lineno for lineno, args in upload_calls
                       if len(args) >= 2 and args[1] == 'frontend.db.gz']

    first_replace = min(replace_lines)
    for line in weather_upload_lines:
        assert line > first_replace, \
            f"weather.json upload (line {line}) appears before first file write (line {first_replace})"

    for line in db_upload_lines:
        assert line > first_replace, \
            f"frontend.db.gz upload (line {line}) appears before first file write (line {first_replace})"
