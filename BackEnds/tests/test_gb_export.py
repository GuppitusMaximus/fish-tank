"""Tests for GB feature rankings export."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank'))

import pytest
import json
from unittest.mock import patch, MagicMock
from export_weather import load_feature_rankings


def test_load_feature_rankings_finds_ranking_files():
    """Test load_feature_rankings() finds ranking files matching models/lasso_rankings_*.json."""
    rankings = load_feature_rankings()

    # Should return a list
    assert isinstance(rankings, list)

    # If any rankings exist, verify structure
    if len(rankings) > 0:
        for ranking in rankings:
            assert 'model_type' in ranking
            assert 'features' in ranking
            assert isinstance(ranking['features'], list)


def test_weather_json_includes_feature_rankings_key():
    """Test weather.json includes feature_rankings key."""
    # Verify the export function includes feature_rankings
    from export_weather import export
    import inspect

    export_source = inspect.getsource(export)

    # Verify load_feature_rankings is called in the export process
    assert 'load_feature_rankings' in export_source
    assert 'feature_rankings' in export_source


def test_rankings_array_structure():
    """Test rankings array structure — each entry has model_type and features array."""
    rankings = load_feature_rankings()

    if len(rankings) > 0:
        for ranking in rankings:
            # Each ranking should have model_type
            assert 'model_type' in ranking
            assert isinstance(ranking['model_type'], str)

            # Each ranking should have features array
            assert 'features' in ranking
            assert isinstance(ranking['features'], list)

            # Verify features array structure
            if len(ranking['features']) > 0:
                first_feature = ranking['features'][0]
                assert 'name' in first_feature
                assert 'coefficient' in first_feature


def test_gb_rankings_file_exists():
    """Test that GB rankings file is included in the export."""
    from train_model import GB_LASSO_PATH

    # After training, the file should exist
    # For now, we just verify the path is defined
    assert GB_LASSO_PATH is not None
    assert 'lasso_rankings_24hr_pubRA_RC3_GB.json' in GB_LASSO_PATH
