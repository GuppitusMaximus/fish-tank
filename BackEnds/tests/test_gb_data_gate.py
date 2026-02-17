"""Tests for GB model data gate."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank'))

import pytest
from unittest.mock import patch, MagicMock
from train_model import GB_MIN_READINGS, train_gb, train, train_simple, train_6hr_rc


def test_gb_min_readings_constant():
    """Test GB_MIN_READINGS constant = 336."""
    assert GB_MIN_READINGS == 336


def test_train_gb_skips_gracefully_with_insufficient_data():
    """Test train_gb() skips gracefully with insufficient data."""
    import pandas as pd

    # Mock load_readings to return insufficient data
    with patch('train_model.load_readings') as mock_load:
        # Return dataframe with < 336 readings
        mock_load.return_value = pd.DataFrame({
            'timestamp': range(100),
            'temp_indoor': [20.0] * 100,
            'temp_outdoor': [15.0] * 100,
        })

        # Should not raise an exception
        try:
            train_gb()
            # If it doesn't raise, the test passes
        except Exception as e:
            pytest.fail(f"train_gb() should not raise exception with insufficient data, got: {e}")


def test_existing_models_unaffected_by_gb_data_gate():
    """Test existing models unaffected by GB data gate."""
    # Verify the functions exist and can be called
    assert callable(train)
    assert callable(train_simple)
    assert callable(train_6hr_rc)

    # Verify GB_MIN_READINGS doesn't affect these functions
    # by checking they don't reference it in their source
    import inspect
    train_source = inspect.getsource(train)
    train_simple_source = inspect.getsource(train_simple)
    train_6hr_rc_source = inspect.getsource(train_6hr_rc)

    # These functions should not reference GB_MIN_READINGS
    assert 'GB_MIN_READINGS' not in train_source
    assert 'GB_MIN_READINGS' not in train_simple_source
    assert 'GB_MIN_READINGS' not in train_6hr_rc_source
