const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/../../private-app/event-dates.js','utf8'),context);
const h=context.window.HBAEventDates;
for(let year=1900;year<=2200;year++){
  const v=h.supper(year),a=new Date(v.date+'T12:00:00Z'),b=new Date(v.rain+'T12:00:00Z');
  assert.equal(a.getUTCDay(),6);assert.equal(a.getUTCMonth(),7);
  assert(a.getUTCDate()>=15&&a.getUTCDate()<=21);assert.equal(b-a,7*86400000);
}
const e={id:'fixture-2027',title:'Spaghetti Supper',event_date:'2027-08-21',rain_date:'2027-08-28',use_rain_date:false,planning_only:true,state:'scheduled',description:'Details pending',location:''};
assert.equal(h.effective(e),'2027-08-21');
assert(h.onDay(e,'2027-08-21'));assert(h.onDay(e,'2027-08-28'));
assert(h.ical(e).includes('DTSTART;VALUE=DATE:20270821'));assert(h.ical(e).includes('STATUS:TENTATIVE'));
assert(h.ical(e,true).includes('DTSTART;VALUE=DATE:20270828'));assert(h.ical(e,true).includes('Backup only'));
const rain={...e,use_rain_date:true,planning_only:false};
assert.equal(h.effective(rain),'2027-08-28');assert(!h.onDay(rain,'2027-08-21'));
assert(h.ical(rain).includes('DTSTART;VALUE=DATE:20270828'));assert(h.ical(rain).includes('Original scheduled date'));
assert(!h.onDay({...e,state:'cancelled'},'2027-08-28'));
assert(h.ical({...e,state:'cancelled'}).includes('STATUS:CANCELLED'));
console.log('301 annual calendar calculations and primary/rain/cancelled calendar-export checks passed.');
const series={id:'supper-series',title:'Spaghetti Supper',recurrence_rule:'august_third_saturday'};
for(let year=1974;year<=2026;year++){
  const p=h.annualProjection(series,year,[],'2026-10-17');
  assert(p.historical_calculated);assert(p.projected);assert(p.planning_only);
  assert(h.ical(p).includes('Not evidence that this supper occurred'));
  assert(h.ical(p).includes('STATUS:TENTATIVE'));
}
assert.equal(h.annualProjection(series,2025,[{series_id:series.id,event_date:'2025-08-10',state:'cancelled'}]),null);
assert.equal(h.annualProjection(series,1799,[]),null);
assert.equal(h.annualProjection(series,1973,[]),null);
assert(h.annualProjection({...series,first_year:1974},1974,[]));
assert.equal(h.annualProjection(series,2201,[]),null);
assert.equal(h.annualProjection(series,NaN,[]),null);
assert.equal(h.annualProjection({...series,recurrence_rule:null},2025,[]),null);
assert.equal(h.annualProjection(series,2027,[],'2026-10-17').historical_calculated,false);
console.log('53 historical projections since first supper in 1974, qualified exports, recorded-year precedence, invalid years and future regression passed.');
