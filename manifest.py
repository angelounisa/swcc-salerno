"""Snapshot manifest: SHA-256 of every input file, script and result, so that a result can be traced to the exact data
and code that produced it. Raw data files are listed with their checksum even when they are not in the repository.
Usage: python manifest.py VERSION out.json"""
import hashlib, json, pathlib, platform, sys, datetime
import numpy, pandas, scipy
FILES = {
    "raw_inputs": ["data.xlsx", "dataV.xlsx", "cal/cal.xlsx", "rain/unif.xlsx", "rain/cava.xlsx", "rain/tempNV.xlsx", "rain/tempV.xlsx", "rain/air_T_RH_2025_from_slides.csv"],
    "derived_inputs": ["cal/NV_cal.xlsx", "cal/V_cal.xlsx", "cal/theta_calibration.json", "sim/infiltration_events.json"],
    "scripts": ["calibrate_theta.py", "analysis.py", "swcc_main.py", "kfield.py", "compare_plots.py", "mechanisms.py", "stability.py", "qc.py",
                "paper_analysis.py", "paper_p2_sens.py", "make_paper_figs.py", "sim/infil_events.py", "exp/common.js", "exp/attribution.js", "exp/events.js", "exp/memory.js", "exp/autumn_check.js", "build.py", "manifest.py"],
    "results": ["results_NV.json", "results_V.json", "swcc_main.json", "kfield.json", "compare.json", "mechanisms.json", "stability.json", "qc.json",
                "paper_analysis.json", "paper_p2.json", "preregistration.json", "exp/attribution.json", "exp/events.json", "exp/memory.json", "exp/autumn_check.json"],
}
sha = lambda f: hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()
out = {"version": sys.argv[1], "created": datetime.date.today().isoformat(),
       "environment": {"python": platform.python_version(), "numpy": numpy.__version__, "pandas": pandas.__version__, "scipy": scipy.__version__},
       "files": {g: {f: {"sha256": sha(f), "bytes": pathlib.Path(f).stat().st_size} for f in fs} for g, fs in FILES.items()}}
json.dump(out, open(sys.argv[2], "w"), indent=1)
print(sum(len(v) for v in out["files"].values()), "files hashed")
