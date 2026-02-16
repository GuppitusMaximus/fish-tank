# BackEnds Test Suite

This directory contains tests for the FishTank backend code.

## Test Coverage

### Manual QA Verification

#### qa-fix-train-y-overwrite
**Plan:** Verify training y-overwrite fix
**Status:** PASS (all checks passed)
**Date:** 2026-02-16

Verified that the fix for the training crash bug is working correctly:

1. **Code review**: Confirmed `y` is not overwritten in `train()`, `train_simple()`, and `train_6hr_rc()`. Each function uses a separate `y_eval` variable for MAE calculation, preserving the original `y` for the final `model.fit(X, y)` call.

2. **Syntax check**: Python syntax validation passed.

3. **Training execution**: All three models trained successfully without dimension mismatch errors:
   - 24hrRaw model → `temp_predictor.joblib` (version 35)
   - 3hrRaw/simple model → `temp_predictor_simple.joblib` (version 68)
   - 6hrRC model → `temp_predictor_6hr_rc.joblib` (version 16)

4. **Prediction execution**: All three models produced valid predictions:
   - `_3hrRaw.json` ✅
   - `_24hrRaw.json` ✅
   - `_6hrRC.json` ✅

**Files verified:**
- `the-snake-tank/train_model.py` — Lines 299-517 (all three training functions)

**No bugs found.** The fix correctly resolves the y-overwrite crash.

## Running Tests

Currently, all tests are manual verification steps. To reproduce the QA verification for the training fix:

```bash
# Verify syntax
python3 -c "import ast; ast.parse(open('the-snake-tank/train_model.py').read()); print('Syntax OK')"

# Run training
cd the-snake-tank && python3 train_model.py

# Run predictions
python3 predict.py --model-type all --predictions-dir data/predictions
```

## Future Test Automation

As the backend evolves, automated pytest tests can be added here. Test files should:
- Use the `test_*.py` naming convention
- Be runnable with `pytest tests/`
- Verify data pipeline output, model predictions, and JSON structure
