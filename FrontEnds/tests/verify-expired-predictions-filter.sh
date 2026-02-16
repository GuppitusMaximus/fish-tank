#!/bin/bash
# Test: Verify expired predictions are filtered from dashboard
# Plan: qa-fix-stale-predictions-frontend

set -e

WEATHER_JS="the-fish-tank/js/weather.js"

echo "✓ Checking renderPredictionsV2() contains time filter..."

# Step 1: Verify new Date() call exists
if ! grep -q "var now = new Date();" "$WEATHER_JS"; then
  echo "✗ FAIL: renderPredictionsV2() missing 'var now = new Date()' line"
  exit 1
fi

# Step 2: Verify filter() call with prediction_for comparison
if ! grep -q "predictions = predictions.filter(function(pred)" "$WEATHER_JS"; then
  echo "✗ FAIL: renderPredictionsV2() missing .filter() call"
  exit 1
fi

# Step 3: Verify defensive fallback for missing prediction_for
if ! grep -q "if (!pred.prediction_for) return true;" "$WEATHER_JS"; then
  echo "✗ FAIL: renderPredictionsV2() missing defensive fallback for missing prediction_for"
  exit 1
fi

# Step 4: Verify future predictions are kept (prediction_for > now)
if ! grep -q "return new Date(pred.prediction_for) > now;" "$WEATHER_JS"; then
  echo "✗ FAIL: renderPredictionsV2() filter logic incorrect (should keep prediction_for > now)"
  exit 1
fi

# Step 5: Verify "No current predictions" empty state after filtering
if ! grep -q 'return.*<p class="empty-state">No current predictions</p>' "$WEATHER_JS"; then
  echo "✗ FAIL: renderPredictionsV2() missing 'No current predictions' empty state message"
  exit 1
fi

echo "✓ renderPredictionsV2() filter implementation verified"

# Step 6: Verify buildHistoryTableV2() does NOT filter by time
echo "✓ Checking buildHistoryTableV2() is unaffected..."

# Extract the buildHistoryTableV2 function
HISTORY_FUNC=$(sed -n '/^  function buildHistoryTableV2()/,/^  }/p' "$WEATHER_JS")

# Check that prediction_for is NOT mentioned in buildHistoryTableV2
if echo "$HISTORY_FUNC" | grep -q "prediction_for"; then
  echo "✗ FAIL: buildHistoryTableV2() contains 'prediction_for' filter (should not filter by time)"
  exit 1
fi

# Check that buildHistoryTableV2 uses historyState.sorted (not filtered by time)
if ! echo "$HISTORY_FUNC" | grep -q "historyState.sorted"; then
  echo "✗ FAIL: buildHistoryTableV2() does not use historyState.sorted"
  exit 1
fi

echo "✓ buildHistoryTableV2() confirmed unaffected (no time filtering)"

# Step 7: Verify V1 code path is unaffected
echo "✓ Checking V1 fallback renderPrediction() is unaffected..."

# Extract renderPrediction function (V1 schema)
RENDER_PRED_V1=$(sed -n '/^  function renderPrediction(pred)/,/^  }/p' "$WEATHER_JS")

# Check that V1 function does NOT have time filtering
if echo "$RENDER_PRED_V1" | grep -q "new Date()"; then
  # This could be legitimate (formatting), so check more specifically
  if echo "$RENDER_PRED_V1" | grep -q "\.filter"; then
    echo "✗ FAIL: renderPrediction() (V1 schema) contains .filter() - should not filter by time"
    exit 1
  fi
fi

echo "✓ V1 fallback renderPrediction() confirmed unaffected"

echo ""
echo "================================================"
echo "PASS: All expired prediction filter checks passed"
echo "================================================"
echo ""
echo "Summary:"
echo "  ✓ renderPredictionsV2() filters expired predictions"
echo "  ✓ Predictions without prediction_for are kept"
echo "  ✓ 'No current predictions' message shown when all expired"
echo "  ✓ buildHistoryTableV2() has no time filtering"
echo "  ✓ V1 code path unaffected"
