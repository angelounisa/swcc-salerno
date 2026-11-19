#!/bin/sh
set -e
for s in V NV; do
  node ev_forest.js ev_soil_final.json evf_${s}_0.json 0/2 $s > evf_${s}_0.log 2>&1 &
  node ev_forest.js ev_soil_final.json evf_${s}_1.json 1/2 $s > evf_${s}_1.log 2>&1; wait
  node ev_forest.js ev_soil_alt.json evfalt_${s}_0.json 0/2 $s > evfalt_${s}_0.log 2>&1 &
  node ev_forest.js ev_soil_alt.json evfalt_${s}_1.json 1/2 $s > evfalt_${s}_1.log 2>&1; wait
done
node ev_soil_bi.js ev_bi_1.json '{"n2":3,"fA":[1],"alpha2":[0.3,1,3],"log10K":[0.5,1,1.5]}' > ev_bi_1.log 2>&1 &
node ev_soil_bi.js ev_bi_2.json '{"n2":3,"fA":[2],"alpha2":[0.3,1,3],"log10K":[0.5,1,1.5]}' > ev_bi_2.log 2>&1; wait
echo FOREST_DONE
