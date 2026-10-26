(() => {
  'use strict';
  function supper(year){
    const first=new Date(Date.UTC(Number(year),7,1));
    const day=1+(6-first.getUTCDay()+7)%7+14;
    return {date:`${year}-08-${String(day).padStart(2,'0')}`,rain:`${year}-08-${String(day+7).padStart(2,'0')}`};
  }
  const effective=e=>e.use_rain_date&&e.rain_date?e.rain_date:e.event_date;
  // Usual time and place for the annual supper, stored as the board setting public_supper_defaults
  // (JSON: time HH:MM, end HH:MM, location). Projected years show them, still marked as planned.
  let supperDefaults={time:null,end:null,location:''};
  function setSupperDefaults(text){
    try{const r=typeof text==='string'?(text?JSON.parse(text):{}):(text||{});
      supperDefaults={time:/^\d{2}:\d{2}$/.test(r.time||'')?r.time:null,end:/^\d{2}:\d{2}$/.test(r.end||'')?r.end:null,location:String(r.location||'')};}
    catch{supperDefaults={time:null,end:null,location:''};}
    return supperDefaults;
  }
  function annualProjection(series,year,events,today=new Date().toLocaleDateString('en-CA')){
    year=Number(year);
    if(series?.recurrence_rule!=='august_third_saturday'||!Number.isInteger(year)||year<(series.first_year||1974)||year>2200||
      events.some(e=>e.series_id===series.id&&e.event_date.slice(0,4)===String(year)))return null;
    const dates=supper(year),historical=dates.date<today;
    return {id:'annual-'+series.id+'-'+year,series_id:series.id,title:series.title,
      event_date:dates.date,rain_date:dates.rain,use_rain_date:false,planning_only:true,state:'scheduled',
      description:historical?'Calculated from the annual date rule, not a confirmed historical occurrence. Whether the supper was held, cancelled or moved to its rain date has not been verified.':(supperDefaults.time||supperDefaults.location?`Calculated from the annual date rule. Usual time and place shown${supperDefaults.end?' (until about '+supperDefaults.end.replace(/^(\d{2}):(\d{2})$/,(_,h,m)=>((+h%12)||12)+(m!=='00'?':'+m:'')+(+h<12?' AM':' PM'))+')':''}; the board confirms each year's details.`:'Calculated from the annual date rule. Time, location and event details have not been entered.'),
      location:historical?'':supperDefaults.location,event_time:historical?null:supperDefaults.time,projected:true,historical_calculated:historical};
  }
  const onDay=(e,key)=>effective(e)===key||(e.state==='scheduled'&&!e.use_rain_date&&e.rain_date===key);
  function ical(e,rainBackup=false){
    if(rainBackup&&!e.rain_date)throw Error('No rain date recorded.');
    const when=rainBackup?e.rain_date:effective(e);
    const clean=s=>String(s??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const end=new Date(when+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);
    const note=rainBackup?'Backup only, not a second supper. Use only if the board activates the rain date. ':
      e.use_rain_date?'Rain date activated. Original scheduled date: '+e.event_date+'. ':
      e.rain_date?'Rain backup: '+e.rain_date+' (only if needed; not a second event). ':'';
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//HBA//Community Archive//EN','BEGIN:VEVENT',
      'UID:'+e.id+(rainBackup?'-rain':'')+'@hba-archive',
      'DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z',
      'DTSTART;VALUE=DATE:'+when.replaceAll('-',''),
      'DTEND;VALUE=DATE:'+end.toISOString().slice(0,10).replaceAll('-',''),
      'SUMMARY:'+clean((e.historical_calculated?'Calculated historical date: ':'')+(rainBackup?'Rain backup (if needed): ':'')+e.title),'LOCATION:'+clean(e.location),
      'DESCRIPTION:'+clean(note+(e.historical_calculated?'Not evidence that this supper occurred. ':e.planning_only?'Planned annual date; details not yet confirmed. ':'')+
        (e.event_time?'Local start time: '+e.event_time.slice(0,5)+'. ':'')+(e.description||'')),
      'STATUS:'+(e.state==='cancelled'?'CANCELLED':rainBackup||e.planning_only?'TENTATIVE':'CONFIRMED'),
      'END:VEVENT','END:VCALENDAR',''].join('\r\n');
  }
  // Tentative 2026 schedule as printed in the March 2026 newsletter. Shown as tentative until the board
  // records each date; the Spaghetti Supper is omitted because the annual rule already projects it.
  const tentative2026=[
    {date:'2026-05-09',time:'09:00',title:'Clean Up Day',location:'Meet at 36 Algelo Ave',note:'Landscaping, painting and general clean-up.'},
    {date:'2026-06-20',time:'17:30',title:'Adult Block Party',location:''},
    {date:'2026-06-28',time:'10:00',title:'General Meeting',location:''},
    {date:'2026-07-04',time:'10:00',title:'Beach Events followed by Bike Parade',location:'The beach'},
    {date:'2026-07-11',time:'10:00',title:'Kids Fishing Derby (10–12)',location:''},
    {date:'2026-07-17',time:'18:00',title:'Adult Bingo',location:''},
    {date:'2026-07-18',time:'11:00',title:'Kids’ Day',location:''},
    {date:'2026-07-18',time:'19:00',title:'Jane and John’s Music on Surf',location:'Surf Avenue'},
    {date:'2026-08-01',time:'13:00',title:'Art Day',location:''},
    {date:'2026-08-01',time:'18:30',title:'Summer Spooktacular',location:''},
    {date:'2026-08-15',time:'08:00',title:'Golf Tournament (rain or shine)',location:''},
    {date:'2026-08-23',time:'10:00',title:'Annual Meeting',location:''}
  ].map(t=>({...t,id:'tentative-'+t.date+'-'+t.title.toLowerCase().replace(/[^a-z0-9]+/g,'-'),tentative:true,source:'Tentative schedule, March 2026 newsletter'}));
  // Standing monthly board-meeting rule, stored as the board setting public_board_meeting_rule
  // (JSON: ordinal 1-5 or -1 for last, weekday 0-6 with Sunday 0, time HH:MM, title, location).
  function parseRule(text){
    if(!text)return null;
    try{const r=typeof text==='string'?JSON.parse(text):text;
      if(!Number.isInteger(r.ordinal)||!Number.isInteger(r.weekday)||!/^\d{2}:\d{2}$/.test(r.time||''))return null;
      return {ordinal:r.ordinal,weekday:r.weekday,time:r.time,title:r.title||'HBA Board of Governors Meeting',location:r.location||'',note:r.note||''};
    }catch{return null;}
  }
  function nthWeekday(year,month,weekday,ordinal){
    if(ordinal===-1){const last=new Date(year,month,0);const back=(last.getDay()-weekday+7)%7;return new Date(year,month-1,last.getDate()-back);}
    const first=new Date(year,month-1,1),offset=(weekday-first.getDay()+7)%7,day=1+offset+(ordinal-1)*7;
    return day>new Date(year,month,0).getDate()?null:new Date(year,month-1,day);
  }
  const ORD=['','first','second','third','fourth','fifth'],DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function ruleLabel(rule){
    if(!rule)return '';
    const [h,mi]=rule.time.split(':').map(Number),t=new Date(2000,0,1,h,mi).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    return `${rule.ordinal===-1?'Last':ORD[rule.ordinal][0].toUpperCase()+ORD[rule.ordinal].slice(1)} ${DAYS[rule.weekday]} of every month at ${t} Eastern`;
  }
  // Projected board meeting for one month, unless a recorded board meeting (any state) already exists that month.
  function boardMeetingProjection(rule,year,month,meetings){
    if(!rule)return null;
    const key=year+'-'+String(month).padStart(2,'0');
    if((meetings||[]).some(m=>m.audience==='board'&&m.meeting_date.startsWith(key)))return null;
    const d=nthWeekday(year,month,rule.weekday,rule.ordinal);if(!d)return null;
    const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return {id:'board-rule-'+key,title:rule.title,meeting_date:date,meeting_time:rule.time+':00',duration_minutes:60,location:rule.location,audience:'board',state:'scheduled',description:'',projected:true,rule_label:ruleLabel(rule)};
  }
  function boardMeetingsBetween(rule,fromKey,months,meetings){
    const out=[];if(!rule)return out;let [y,m]=fromKey.slice(0,7).split('-').map(Number);
    for(let i=0;i<months;i++){const p=boardMeetingProjection(rule,y,m,meetings);if(p)out.push(p);m++;if(m>12){m=1;y++;}}
    return out;
  }
  window.HBAEventDates={supper,effective,onDay,ical,annualProjection,tentative2026,parseRule,nthWeekday,ruleLabel,boardMeetingProjection,boardMeetingsBetween,setSupperDefaults,get supperDefaults(){return supperDefaults;}};
})();
