#!/bin/sh
# Event-scale inverse analysis (model tab, section 4). Run from exp/. ~1.5 h on 2 cores.
set -e
node ev_soil.js ev_soil.json                                                     # unimodal, g x fA x log10K, first grid
node ev_soil.js ev_soil_c1.json '{"g":[1.5,1.75],"fA":[2],"log10K":[0.25,0.5,0.75,1,1.25]}'
node ev_soil.js ev_soil_c2.json '{"g":[2,1.5],"fA":[3,1.5],"log10K":[0.5,1]}'
node ev_soil_bi.js ev_bi_1.json '{"n2":3,"fA":[1],"alpha2":[0.3,1,3],"log10K":[0,0.5,1]}'   # bimodal variant (not retained)
node ev_soil_bi.js ev_bi_2.json '{"n2":3,"fA":[2],"alpha2":[0.3,1,3],"log10K":[0,0.5,1]}'
# chosen point (ev_soil_final.json) and alternative on the g-K valley (ev_soil_alt.json) are written by hand from the grids
for s in V NV; do for sh in 0 1; do node ev_forest.js ev_soil_final.json evf_${s}_$sh.json $sh/2 $s; node ev_forest.js ev_soil_alt.json evfalt_${s}_$sh.json $sh/2 $s; done; done
node ev_soil_summary.js ev_soil_summary.json
node ev_summary.js ev_summary.json
