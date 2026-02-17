"""Tests for GB Lasso diagnostic output."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank'))

import pytest
import json
from train_model import _build_gb_feature_names, GB_LASSO_PATH


def test_build_gb_feature_names_returns_942_names():
    """Test _build_gb_feature_names() returns exactly 942 names."""
    feature_names = _build_gb_feature_names()

    assert len(feature_names) == 942, f"Expected 942 feature names, got {len(feature_names)}"


def test_feature_name_patterns():
    """Test feature name patterns — verify names include _lag_ suffixes and rc_ prefix."""
    feature_names = _build_gb_feature_names()

    # Check for lag suffix patterns in base features
    # Base features: 33 columns × 24 lags = 792 features
    lag_features = [name for name in feature_names if '_lag_' in name]
    assert len(lag_features) > 0, "Should have features with _lag_ suffix"

    # Check for rc_ prefix in residual correction features
    # RC features: last 150 features
    rc_features = [name for name in feature_names if name.startswith('rc_')]
    assert len(rc_features) > 0, "Should have features with rc_ prefix"

    # Verify rc_ features are for the 3 model types
    assert any('rc_3hrRaw_' in name for name in feature_names)
    assert any('rc_24hrRaw_' in name for name in feature_names)
    assert any('rc_6hrRC_' in name for name in feature_names)


def test_lasso_rankings_file_format():
    """Test Lasso rankings file format."""
    # Check if the file exists
    if not os.path.exists(GB_LASSO_PATH):
        pytest.skip(f"Lasso rankings file not found: {GB_LASSO_PATH}")

    # Load and verify structure
    with open(GB_LASSO_PATH, 'r') as f:
        rankings = json.load(f)

    # Verify required fields
    assert 'model_type' in rankings
    assert rankings['model_type'] == '24hr_pubRA_RC3_GB'

    assert 'generated_at' in rankings
    assert isinstance(rankings['generated_at'], str)

    assert 'feature_count' in rankings
    assert isinstance(rankings['feature_count'], int)

    assert 'nonzero_count' in rankings
    assert isinstance(rankings['nonzero_count'], int)

    assert 'features' in rankings
    assert isinstance(rankings['features'], list)

    # Verify features array structure
    if len(rankings['features']) > 0:
        first_feature = rankings['features'][0]
        assert 'name' in first_feature
        assert 'coefficient' in first_feature
        assert isinstance(first_feature['name'], str)
        assert isinstance(first_feature['coefficient'], (int, float))


def test_features_sorted_by_absolute_coefficient():
    """Test features are sorted by absolute coefficient (descending)."""
    if not os.path.exists(GB_LASSO_PATH):
        pytest.skip(f"Lasso rankings file not found: {GB_LASSO_PATH}")

    with open(GB_LASSO_PATH, 'r') as f:
        rankings = json.load(f)

    features = rankings['features']

    if len(features) > 1:
        # Check that absolute coefficients are in descending order
        abs_coeffs = [abs(f['coefficient']) for f in features]
        assert abs_coeffs == sorted(abs_coeffs, reverse=True), \
            "Features should be sorted by absolute coefficient in descending order"
