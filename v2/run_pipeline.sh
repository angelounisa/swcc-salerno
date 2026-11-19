#!/bin/bash
# Model pipeline: vertical column (slope 0, saved as baseline) and then infinite slope (28 deg), then checks.
# usage (from the repo root, with the calibrated meter files): ./run_pipeline.sh RAIN NV_CAL V_CAL
set -euo pipefail
RAIN=$1; NV=$2; V=$3
for SLOPE in 0 28; do
  python3 kfield.py "$RAIN" "$NV" "$V" swcc_main.json kfield.json $SLOPE | tail -1
  ( cd sim
    python3 build_models.py ../swcc_main.json ../kfield.json $SLOPE
    rm -f calibdry2_NV.json calibdry2_V.json
    node calib_dry2.js NV calibdry2_NV.json > calibdry2_NV.log 2>&1 &
    node calib_dry2.js V calibdry2_V.json > calibdry2_V.log 2>&1
    wait
    tail -n 1 calibdry2_NV.log; tail -n 1 calibdry2_V.log
    node final4.js sim2_results.json | grep -v "Kmac_A1" | cut -c1-400
    if [ "$SLOPE" = "0" ]; then python3 save_baseline.py ../kfield.json baseline_vertical.json; fi )
done
( cd sim && node excess.js && node test_slope.js | tail -1 )
( cd verify && python3 ref_solver.py ../sim/sim2_results.json ../sim/fits_main.json out_ref.json 2>/dev/null | tail -1 && node compare.js > compare.log && cat compare.log )
echo PIPELINE_DONE
