import { readFileSync } from "fs"; import { createHash } from "crypto";
import { analyseObservability } from "./dist/observability.js";
import { analyseBrevity } from "./dist/brevity.js";
const cwd=process.cwd();
const F=["assertions.ts","author.ts","baseline.ts","brevity.ts","checker.ts","command-check.ts","index.ts","manual.ts","notify.ts","observability.ts","parser.ts","regression.ts","store.ts","types.ts","format-result.ts","find-functions.ts","evaluate-proof.ts"];
for(const f of F){
const p="src/"+f; const c=readFileSync(p,"utf8");
const h=createHash("sha256").update(c).digest("hex").slice(0,8);
const o=analyseObservability("tsc "+p,cwd)||{totalLogStatements:0,totalErrorHandlers:0,errorHandlersLogged:0,antiPatterns:[]};
const b=analyseBrevity("tsc "+p,cwd); const pf=b?.perFile?.[0];
let os=10,bs=10; const ap=o.antiPatterns||[];
os-=ap.filter(a=>a.kind==="empty_catch").length*2;
os-=(o.totalErrorHandlers-o.errorHandlersLogged)*2;
os-=ap.filter(a=>a.kind==="bare_log").length;
if(o.totalLogStatements===0&&c.split("\n").length>20)os-=3; os=Math.max(1,os);
const lf=pf?.violations?.filter(v=>v.kind==="function_too_long").length??0;
const mc=pf?.violations?.filter(v=>v.kind==="mixed_cohesion").length??0;
const fl=pf?.violations?.some(v=>v.kind==="file_too_long")??false;
const ll=pf?.violations?.filter(v=>v.kind==="line_too_long").length??0;
const ln=c.split("\n").length;
bs-=Math.min(lf,4); bs-=Math.min(mc,3); if(fl||ln>300)bs-=1;
bs-=Math.min(Math.floor(ll*0.5),3); bs=Math.max(1,bs);
console.log(JSON.stringify({file:p,hash:h,lines:ln,obs:{score:os,log_statements:o.totalLogStatements,error_handlers:o.totalErrorHandlers,error_handlers_logged:o.errorHandlersLogged,anti_patterns:ap.map(a=>a.kind+":"+a.line)},brev:{score:bs,long_lines:ll,long_functions:lf,file_too_long:fl||ln>300,mixed_cohesion_functions:mc}}));
}
