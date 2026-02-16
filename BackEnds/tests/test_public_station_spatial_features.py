#!/usr/bin/env python3
"""QA tests for public station spatial features integration in ML models.

This test suite verifies the implementation of spatial features from public
Netatmo stations, ensuring:
- public_features.py exports correct constants and functions
- Feature dimensions are consistent between training and prediction
- Graceful fallback when no public data exists (all spatial features = 0.0)
- Integration works correctly in predict.py and train_model.py
"""

import os
import sys
import pandas as pd
import pytest

# Add the-snake-tank to path
SNAKE_TANK_DIR = os.path.join(os.path.dirname(__file__), "..", "the-snake-tank")
sys.path.insert(0, SNAKE_TANK_DIR)

from public_features import SPATIAL_COLS_FULL, SPATIAL_COLS_SIMPLE, add_spatial_columns


class TestPublicFeatureConstants:
    """Test that public_features.py exports the correct constants."""

    def test_spatial_cols_full_count(self):
        """SPATIAL_COLS_FULL should have 6 features."""
        assert len(SPATIAL_COLS_FULL) == 6, f"Expected 6 features, got {len(SPATIAL_COLS_FULL)}"

    def test_spatial_cols_full_contents(self):
        """SPATIAL_COLS_FULL should contain expected feature names."""
        expected = [
            'regional_avg_temp',
            'regional_temp_delta',
            'regional_temp_spread',
            'regional_avg_humidity',
            'regional_avg_pressure',
            'regional_station_count'
        ]
        assert SPATIAL_COLS_FULL == expected, f"Got {SPATIAL_COLS_FULL}"

    def test_spatial_cols_simple_count(self):
        """SPATIAL_COLS_SIMPLE should have 3 features."""
        assert len(SPATIAL_COLS_SIMPLE) == 3, f"Expected 3 features, got {len(SPATIAL_COLS_SIMPLE)}"

    def test_spatial_cols_simple_contents(self):
        """SPATIAL_COLS_SIMPLE should contain expected feature names."""
        expected = [
            'regional_avg_temp',
            'regional_temp_delta',
            'regional_station_count'
        ]
        assert SPATIAL_COLS_SIMPLE == expected, f"Got {SPATIAL_COLS_SIMPLE}"

    def test_add_spatial_columns_callable(self):
        """add_spatial_columns should be a callable function."""
        assert callable(add_spatial_columns), "add_spatial_columns is not callable"


class TestGracefulFallback:
    """Test graceful fallback when no public data exists."""

    def test_fallback_with_empty_data(self):
        """When no public data exists, all spatial columns should be 0.0."""
        DB_PATH = os.path.join(SNAKE_TANK_DIR, "data", "weather.db")

        # Create a small test dataframe
        df = pd.DataFrame({
            'timestamp': [1000000, 1003600],
            'temp_outdoor': [10.0, 11.0],
        })

        result = add_spatial_columns(DB_PATH, df)

        # All spatial columns should exist and be 0.0
        for col in SPATIAL_COLS_FULL:
            assert col in result.columns, f'Missing column: {col}'
            assert (result[col] == 0.0).all(), f'Column {col} should be all zeros when no public data'


class TestFeatureDimensionConsistency:
    """Test that feature dimensions are consistent between training and prediction."""

    def test_simple_model_dimensions(self):
        """3hrRaw model should use (9 base + 3 spatial) * 3 lookback = 36 features."""
        from predict import SIMPLE_FEATURE_COLS, SIMPLE_LOOKBACK

        simple_dim = (len(SIMPLE_FEATURE_COLS) + len(SPATIAL_COLS_SIMPLE)) * SIMPLE_LOOKBACK
        assert simple_dim == 36, f"3hrRaw should be 36 features, got {simple_dim}"

    def test_full_model_dimensions(self):
        """24hrRaw model should use (22 base + 6 spatial) * 24 lookback = 672 features."""
        from predict import FEATURE_COLS, LOOKBACK

        full_dim = (len(FEATURE_COLS) + len(SPATIAL_COLS_FULL)) * LOOKBACK
        assert full_dim == 672, f"24hrRaw should be 672 features, got {full_dim}"

    def test_6hr_rc_model_dimensions(self):
        """6hrRC model should use (9 base + 3 spatial) * 6 lookback + 14 error features = 86 features."""
        from predict import SIMPLE_FEATURE_COLS, RC_LOOKBACK

        rc_base = (len(SIMPLE_FEATURE_COLS) + len(SPATIAL_COLS_SIMPLE)) * RC_LOOKBACK
        rc_errors = RC_LOOKBACK * 2 + 2  # indoor + outdoor lags + 2 averages
        rc_dim = rc_base + rc_errors
        assert rc_dim == 86, f"6hrRC should be 86 features, got {rc_dim}"


class TestPredictIntegration:
    """Test that predict.py correctly imports and uses spatial features."""

    def test_predict_imports(self):
        """predict.py should import spatial feature constants and function."""
        from predict import SPATIAL_COLS_FULL, SPATIAL_COLS_SIMPLE, add_spatial_columns
        # If imports work, this test passes
        assert SPATIAL_COLS_FULL is not None
        assert SPATIAL_COLS_SIMPLE is not None
        assert callable(add_spatial_columns)

    def test_predict_combined_columns(self):
        """predict.py should define combined feature lists."""
        from predict import SIMPLE_ALL_COLS, FULL_ALL_COLS, RC_ALL_COLS
        from predict import SIMPLE_FEATURE_COLS, FEATURE_COLS

        # SIMPLE_ALL_COLS should be SIMPLE_FEATURE_COLS + SPATIAL_COLS_SIMPLE
        expected_simple = len(SIMPLE_FEATURE_COLS) + len(SPATIAL_COLS_SIMPLE)
        assert len(SIMPLE_ALL_COLS) == expected_simple, \
            f"SIMPLE_ALL_COLS should have {expected_simple} columns, got {len(SIMPLE_ALL_COLS)}"

        # FULL_ALL_COLS should be FEATURE_COLS + SPATIAL_COLS_FULL
        expected_full = len(FEATURE_COLS) + len(SPATIAL_COLS_FULL)
        assert len(FULL_ALL_COLS) == expected_full, \
            f"FULL_ALL_COLS should have {expected_full} columns, got {len(FULL_ALL_COLS)}"

        # RC_ALL_COLS should be SIMPLE_FEATURE_COLS + SPATIAL_COLS_SIMPLE
        expected_rc = len(SIMPLE_FEATURE_COLS) + len(SPATIAL_COLS_SIMPLE)
        assert len(RC_ALL_COLS) == expected_rc, \
            f"RC_ALL_COLS should have {expected_rc} columns, got {len(RC_ALL_COLS)}"


class TestTrainModelIntegration:
    """Test that train_model.py correctly imports and uses spatial features."""

    def test_train_model_imports(self):
        """train_model.py should import spatial feature constants and function."""
        from train_model import SPATIAL_COLS_FULL, SPATIAL_COLS_SIMPLE, add_spatial_columns
        # If imports work, this test passes
        assert SPATIAL_COLS_FULL is not None
        assert SPATIAL_COLS_SIMPLE is not None
        assert callable(add_spatial_columns)

    def test_train_model_combined_columns(self):
        """train_model.py should define combined feature lists matching predict.py."""
        from train_model import SIMPLE_ALL_COLS, FULL_ALL_COLS, RC_ALL_COLS
        from train_model import SIMPLE_FEATURE_COLS, FEATURE_COLS

        # SIMPLE_ALL_COLS should be SIMPLE_FEATURE_COLS + SPATIAL_COLS_SIMPLE
        expected_simple = len(SIMPLE_FEATURE_COLS) + len(SPATIAL_COLS_SIMPLE)
        assert len(SIMPLE_ALL_COLS) == expected_simple, \
            f"SIMPLE_ALL_COLS should have {expected_simple} columns, got {len(SIMPLE_ALL_COLS)}"

        # FULL_ALL_COLS should be FEATURE_COLS + SPATIAL_COLS_FULL
        expected_full = len(FEATURE_COLS) + len(SPATIAL_COLS_FULL)
        assert len(FULL_ALL_COLS) == expected_full, \
            f"FULL_ALL_COLS should have {expected_full} columns, got {len(FULL_ALL_COLS)}"

        # RC_ALL_COLS should be SIMPLE_FEATURE_COLS + SPATIAL_COLS_SIMPLE
        expected_rc = len(SIMPLE_FEATURE_COLS) + len(SPATIAL_COLS_SIMPLE)
        assert len(RC_ALL_COLS) == expected_rc, \
            f"RC_ALL_COLS should have {expected_rc} columns, got {len(RC_ALL_COLS)}"

    def test_train_predict_column_lists_match(self):
        """Column lists should match exactly between train_model.py and predict.py."""
        from train_model import SIMPLE_ALL_COLS as TRAIN_SIMPLE, FULL_ALL_COLS as TRAIN_FULL, RC_ALL_COLS as TRAIN_RC
        from predict import SIMPLE_ALL_COLS as PREDICT_SIMPLE, FULL_ALL_COLS as PREDICT_FULL, RC_ALL_COLS as PREDICT_RC

        assert TRAIN_SIMPLE == PREDICT_SIMPLE, "SIMPLE_ALL_COLS mismatch between train and predict"
        assert TRAIN_FULL == PREDICT_FULL, "FULL_ALL_COLS mismatch between train and predict"
        assert TRAIN_RC == PREDICT_RC, "RC_ALL_COLS mismatch between train and predict"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
