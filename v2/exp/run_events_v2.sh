#!/bin/sh
# v2 event-scale inverse analysis (user's theta calibration). Run from exp/. Soil grid in two shards (2 cores).
set -e
node ev_soil.js ev_soil_a.json '{"g":[1,1.5,2],"fA":[1,2,4],"log10K":[-1,-0.5,0,0.5,1,1.5]}' > ev_soil_a.log 2>&1 &
node ev_soil.js ev_soil_b.json '{"g":[3,4],"fA":[1,2,4],"log10K":[-1,-0.5,0,0.5,1,1.5]}' > ev_soil_b.log 2>&1
wait
echo SOIL_DONE
