// node run2.js SITE [eFactor tFrac]  -> one run with model_SITE.json, forcing_SITE.json, results_SITE.json
const fs=require('fs'), S=require('./solver.js');
const site=process.argv[2];
const F=JSON.parse(fs.readFileSync(`forcing_${site}.json`)), R=JSON.parse(fs.readFileSync(`../results_${site}.json`)), M=JSON.parse(fs.readFileSync(`model_${site}.json`));
if(process.argv[3]){ M.eFactor=+process.argv[3]; M.tFrac=+process.argv[4]; }
const fits={}; for(const k of Object.keys(R.depths)) fits[k]=R.depths[k].fits.drying.params;
const t=Date.now(); const o=S.run(S.buildConfig(M,fits,F.s0_kPa),F);
const rm={}; for(const k of Object.keys(F.obs)){ let e=0,n=0; F.obs[k].forEach((v,i)=>{ if(v!=null){ e+=(o.theta[+k][i]-v)**2; n++; } }); rm[k]=+Math.sqrt(e/n).toFixed(4); }
console.log(site, Date.now()-t,'ms', JSON.stringify(rm), JSON.stringify(Object.fromEntries(Object.entries(o.massBalance).map(([k,v])=>[k,+v.toFixed(3)]))));
