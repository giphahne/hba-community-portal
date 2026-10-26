// The default summer pattern (now data, editable by the administrator) must still reproduce the board's printed
// 2026 sheet and its wording. Run: node tools/tests/test-summer-rules.cjs
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const app=path.join(__dirname,'..','..','private-app');
const window={};const ctx={window,document:{addEventListener(){},createElement(){return{}}},console,Date};
vm.createContext(ctx);
for(const f of ['event-dates.js','summer-events.js'])vm.runInContext(fs.readFileSync(path.join(app,f),'utf8'),ctx);
const S=window.HBASummer,iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const printed2026={welcome:'2026-06-20',assoc:'2026-06-28',july4:'2026-07-04',bingo1:'2026-07-17',kickoff:'2026-07-18',music:'2026-07-18',
  art:'2026-08-01',spook:'2026-08-01',golf:'2026-08-15',supper:'2026-08-15',bingo2:'2026-08-28',annual:'2026-08-23'};
let n=0;
for(const r of S.RULES){if(printed2026[r.key]){assert.strictEqual(iso(r.date(2026)),printed2026[r.key],r.key);n++;}}
const by=k=>S.RULES.find(r=>r.key===k);
assert.strictEqual(iso(by('kickoff').date(2027)),'2027-06-12','Summer Kickoff moves to the second Saturday of June from 2027');
assert.strictEqual(iso(by('supper').rain(2026)),'2026-08-22','Spaghetti Supper rain date is the following Saturday');
const wording={welcome:'Third Saturday of June',assoc:'Last Sunday of June',july4:'July 4',
  derby:'A Saturday in July or August when 11 AM is about mid tide, going out',bingo2:'Last Friday of August',
  kickoff:'Second Saturday of June (from 2027; Kids’ Day was the third Saturday of July through 2026)',
  spook:'First Saturday of August (same day as Art Day)',supper:'Third Saturday of August; the following Saturday is the rain date',
  movie:'Date set each summer'};
for(const [k,w] of Object.entries(wording))assert.strictEqual(by(k).when,w,k);
assert.strictEqual(S.RULES.length,14);
console.log(`Summer pattern: ${n} printed 2026 dates, the 2027 Kickoff change, the supper rain date and ${Object.keys(wording).length} descriptions match.`);
