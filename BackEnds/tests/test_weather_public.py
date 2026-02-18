"""Tests for weather-public.json generation in export_weather.py."""
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


def test_public_file_generated():
    """export() writes weather-public.json to the same directory as weather.json."""
    func_src = _get_function_source(_read_source(), 'export')
    assert func_src is not None, "export() function not found"
    assert 'weather-public.json' in func_src, "export() does not reference weather-public.json"


def test_public_schema_keys_only():
    """weather-public.json includes schema_version, generated_at, property_meta, current, predictions, next_prediction."""
    func_src = _get_function_source(_read_source(), 'export')
    assert func_src is not None, "export() function not found"

    assert 'schema_version' in func_src, "public_data missing schema_version"
    assert 'generated_at' in func_src, "public_data missing generated_at"
    assert "'current'" in func_src or '"current"' in func_src, "public_data missing current"

    # Parse the AST to find the public_data assignment
    source = _read_source()
    tree = ast.parse(source)
    export_func = None
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == 'export':
            export_func = node
            break

    assert export_func is not None

    # Find assignment to 'public_data'
    public_data_keys = None
    for node in ast.walk(export_func):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == 'public_data':
                    if isinstance(node.value, ast.Dict):
                        public_data_keys = []
                        for k in node.value.keys:
                            if isinstance(k, ast.Constant):
                                public_data_keys.append(k.value)

    assert public_data_keys is not None, "Could not find public_data dict assignment in export()"
    expected = {'schema_version', 'generated_at', 'property_meta', 'current', 'predictions', 'next_prediction'}
    assert set(public_data_keys) == expected, \
        f"public_data has unexpected keys: {public_data_keys}"


def test_no_private_keys_in_public():
    """history and feature_rankings are NOT in public_data."""
    source = _read_source()
    tree = ast.parse(source)
    export_func = None
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == 'export':
            export_func = node
            break

    assert export_func is not None

    public_data_keys = None
    for node in ast.walk(export_func):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == 'public_data':
                    if isinstance(node.value, ast.Dict):
                        public_data_keys = []
                        for k in node.value.keys:
                            if isinstance(k, ast.Constant):
                                public_data_keys.append(k.value)

    assert public_data_keys is not None, "Could not find public_data dict"
    private = {'history', 'feature_rankings'}
    found = private.intersection(set(public_data_keys))
    assert not found, f"Private keys found in public_data: {found}"


def test_atomic_write():
    """weather-public.json is written using tempfile.mkstemp() + os.replace() pattern."""
    func_src = _get_function_source(_read_source(), 'export')
    assert func_src is not None, "export() function not found"
    assert 'mkstemp' in func_src, "weather-public.json not written with tempfile.mkstemp()"
    assert 'os.replace' in func_src, "weather-public.json not written with os.replace()"
