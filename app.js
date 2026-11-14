(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const STORAGE = "pulseguard-config-v1";
  const fieldOptions = Array.from({length:8}, (_,i) => `<option value="${i+1}">Field ${i+1}</option>`).join("");
  ["mapHeart","mapSpo2","mapTemp","mapProbe","mapEcg","mapMotion"].forEach(id => $(id).innerHTML = `<option value="">Not mapped</option>${fieldOptions}`);
  $("mapHeart").value="1"; $("mapSpo2").value="2"; $("mapTemp").value="3"; $("mapProbe").value="4"; $("mapEcg").value="5"; $("mapMotion").value="6";

  const state = {
    mode:"demo", channelId:"", readKey:"", interval:15000,
    map:{heartRate:"1",spo2:"2",temperature:"3",probeTemp:"4",ecg:"5",motion:"6"},
    timer:null, history:[], alerts:[], latest:null, demoIndex:0, ecgSamples:[], feed:null
  };
  const units={heartRate:"BPM",spo2:"%",temperature:"°C",probeTemp:"°C"};
  const labels={heartRate:"Heart rate",spo2:"SpO₂",temperature:"MLX temperature",probeTemp:"Probe temperature"};
  const thresholds={heartRate:[50,120],spo2:[94,100],temperature:[35,38],probeTemp:[30,40]};
  let toastTimer;
  function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2800)}
  function loadConfig(){
    try{const c=JSON.parse(localStorage.getItem(STORAGE)||"{}");Object.assign(state,c);if(c.map)state.map=c.map}catch(e){}
    $("channelId").value=state.channelId||"";$("readKey").value=state.readKey||"";$("refreshInterval").value=String(state.interval||15000);$("dataMode").value=state.mode||"demo";
    Object.entries({mapHeart:"heartRate",mapSpo2:"spo2",mapTemp:"temperature",mapProbe:"probeTemp",mapEcg:"ecg",mapMotion:"motion"}).forEach(([id,k])=>$(id).value=state.map[k]||"");
  }
  function saveConfig(){const c={mode:state.mode,channelId:state.channelId,readKey:state.readKey,interval:state.interval,map:state.map};localStorage.setItem(STORAGE,JSON.stringify(c))}
  function updateModeUI(){
    const demo=state.mode==="demo";$("modeLabel").textContent=demo?"DEMO MODE":"THINGSPEAK";$("modeDot").className="pulse-dot "+(demo?"":"good");$("demoNotice").style.display=demo?"flex":"none";
    $("sideConnection").textContent=demo?"Demo preview":(state.feed?"Cloud connected":"Not connected");$("sideDot").className="pulse-dot "+(state.feed?"good":"");
    $("refreshRateLabel").textContent=(state.interval/1000)+" SEC";
  }
  function fmt(v,d=1){return Number.isFinite(Number(v))?Number(v).toFixed(d):"--"}
  function classify(key,val){const r=thresholds[key];if(val==null||!Number.isFinite(Number(val)))return ["Awaiting reading","neutral"];const n=Number(val);if(n<r[0]||n>r[1])return ["Outside display range","bad"];return ["Within display range","good"]}
  function setMetric(key,val){
    const ids={heartRate:["heartRate","hrStatus","hrDot"],spo2:["spo2","spo2Status","spo2Dot"],temperature:["temperature","tempStatus","tempDot"],probeTemp:["probeTemp","probeStatus","probeDot"]};
    const [valueId,statusId,dotId]=ids[key];$(valueId).textContent=val==null?"--":fmt(val,key==="heartRate"||key==="spo2"?0:1);
    const [txt,kind]=classify(key,val);$(statusId).textContent=txt;$(dotId).className="status-dot "+kind;
    if(key==="spo2")$("spo2Bar").style.width=Math.max(0,Math.min(100,Number(val)||0))+"%";
    if(key==="temperature")$("tempMarker").style.left=Math.max(0,Math.min(100,((Number(val)-34)/8)*100))+"%";
  }
  function addAlert(title,detail){
    const last=state.alerts[0];if(last&&last.title===title&&Date.now()-last.time<60000)return;
    state.alerts.unshift({title,detail,time:Date.now()});state.alerts=state.alerts.slice(0,8);renderAlerts();
  }
  function checkAlerts(d){
    Object.keys(thresholds).forEach(k=>{if(d[k]==null)return;const [lo,hi]=thresholds[k];if(d[k]<lo||d[k]>hi)addAlert(`${labels[k]} outside display range`,`${fmt(d[k])} ${units[k]} · configured display range ${lo}–${hi} ${units[k]}`)});
    if(d.fall===1)addAlert("Fall alert received","ESP32 reported a possible fall event.");
  }
  function renderAlerts(){
    $("navAlertCount").textContent=state.alerts.length;
    $("alertList").innerHTML=state.alerts.length?state.alerts.map(a=>`<div class="alert-item"><span class="alert-mark">!</span><div><b>${esc(a.title)}</b><small>${esc(a.detail)}</small></div><span class="alert-time">${new Date(a.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span></div>`).join(""):`<div class="empty-state">No alerts yet. Incoming readings will be checked against the configured display thresholds.</div>`;
  }
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function normalizeFeed(entry){
    const out={};Object.entries(state.map).forEach(([k,field])=>{if(field&&entry["field"+field]!==null&&entry["field"+field]!==undefined&&entry["field"+field]!=="")out[k]=Number(entry["field"+field])});
    if(out.motion!==undefined){out.fall=out.motion>=1?1:0;delete out.motion}
    return out;
  }
  function applyReading(d,createdAt){
    state.latest=d;Object.keys(units).forEach(k=>setMetric(k,d[k]));
    const fall=Number(d.fall||0)===1;$("motionState").className="motion-state"+(fall?" fall":"");
    $("motionState").innerHTML=fall?`<span class="motion-symbol">!</span><div><b>Possible fall reported</b><small>Fall flag received from ESP32</small></div>`:`<span class="motion-symbol">↗</span><div><b>Normal movement</b><small>${state.mode==="demo"?"Demo status":"No fall flag in latest packet"}</small></div>`;
    if(d.ax!==undefined)$("accelX").innerHTML=fmt(d.ax,2)+' <em>g</em>';if(d.ay!==undefined)$("accelY").innerHTML=fmt(d.ay,2)+' <em>g</em>';if(d.az!==undefined)$("accelZ").innerHTML=fmt(d.az,2)+' <em>g</em>';
    if(d.ecg!==undefined){$("ecgValue").textContent=fmt(d.ecg,0);state.ecgSamples.push(Number(d.ecg));state.ecgSamples=state.ecgSamples.slice(-300)}
    const point={...d,time:createdAt?new Date(createdAt).getTime():Date.now()};state.history.push(point);state.history=state.history.slice(-60);
    checkAlerts(d);renderTrend();$("lastUpdated").textContent="Updated "+new Date(point.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
    $("packetTime").textContent=new Date(point.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
    drawEcg();updateModeUI();
  }
  async function fetchThingSpeak(){
    if(!state.channelId){throw new Error("Enter a ThingSpeak channel ID first.")};
    const base=`https://api.thingspeak.com/channels/${encodeURIComponent(state.channelId)}/feeds.json?results=30`;
    const url=base+(state.readKey?"&api_key="+encodeURIComponent(state.readKey):"");
    const res=await fetch(url,{cache:"no-store"});if(!res.ok)throw new Error("ThingSpeak returned HTTP "+res.status);
    const data=await res.json();if(!data.feeds||!data.feeds.length)throw new Error("No feed entries found. Check channel ID, read key and field mapping.");
    state.feed=data.channel||{};$("cloudStatus").textContent="Connected";$("espStatus").textContent="Cloud feed active";$("connectionBadge").textContent="CONNECTED";$("connectionBadge").classList.add("online");
    state.history=[];state.alerts=[];
    data.feeds.forEach(f=>{const d=normalizeFeed(f);state.history.push({...d,time:new Date(f.created_at).getTime()});});
    state.history=state.history.slice(-60);const last=data.feeds[data.feeds.length-1];const reading=normalizeFeed(last);applyReading(reading,last.created_at);
    $("ecgState").textContent=reading.ecg!==undefined?"CHANNEL SAMPLES":"NO ECG FIELD";$("ecgMessage").textContent="ThingSpeak feed samples · update rate depends on channel plan";
    $("configMessage").textContent="Connected. Latest channel data loaded.";
  }
  function demoReading(){
    const i=state.demoIndex++;const wobble=Math.sin(i/3);
    const hr=76+Math.round(5*wobble+(Math.random()*4-2)),spo=97+Math.round(Math.random()*2);
    const temp=36.6+Math.sin(i/5)*.15+(Math.random()-.5)*.08,probe=36.8+Math.sin(i/6)*.12;
    const ecg=512+Math.sin(i*1.7)*35+(i%18===0?180:0);
    return {heartRate:hr,spo2:spo,temperature:temp,probeTemp:probe,ecg,fall:0,ax:.02+Math.random()*.02,ay:.01+Math.random()*.02,az:.98+Math.random()*.03};
  }
  function startDemo(){
    clearInterval(state.timer);state.mode="demo";state.feed=null;state.history=[];state.alerts=[];state.ecgSamples=[];
    $("cloudStatus").textContent="Demo preview";$("espStatus").textContent="Simulated";$("connectionBadge").textContent="DEMO";$("connectionBadge").classList.remove("online");
    $("ecgState").textContent="DEMO SIGNAL";$("ecgMessage").textContent="Illustrative waveform, not a real ECG measurement";
    $("dataMode").value="demo";updateModeUI();renderAlerts();
    for(let i=0;i<20;i++){const d=demoReading();state.history.push({...d,time:Date.now()-(19-i)*15000});state.ecgSamples.push(d.ecg)}
    state.demoIndex=20;applyReading(demoReading(),new Date().toISOString());saveConfig();state.timer=setInterval(()=>applyReading(demoReading(),new Date().toISOString()),state.interval);
  }
  function drawEcg(){
    const canvas=$("ecgCanvas"),ctx=canvas.getContext("2d"),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
    canvas.width=Math.max(1,rect.width*dpr);canvas.height=Math.max(1,rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=rect.width,h=rect.height;ctx.clearRect(0,0,w,h);const arr=state.ecgSamples.slice(-240);
    if(arr.length<2)return;const min=Math.min(...arr),max=Math.max(...arr),range=Math.max(1,max-min);
    ctx.beginPath();arr.forEach((v,i)=>{const x=(i/(arr.length-1))*w;const y=h-12-((v-min)/range)*(h-24);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
    ctx.strokeStyle="#65e3b2";ctx.lineWidth=1.7;ctx.shadowColor="#45d6a0";ctx.shadowBlur=7;ctx.stroke();ctx.shadowBlur=0;
  }
  function drawTrend(){
    const canvas=$("trendCanvas");if(!canvas)return;const ctx=canvas.getContext("2d"),r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
    canvas.width=Math.max(1,r.width*dpr);canvas.height=Math.max(1,r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=r.width,h=r.height,pad={l:30,r:12,t:14,b:18};ctx.clearRect(0,0,w,h);
    const key=$("trendMetric").value,vals=state.history.map(x=>x[key]).filter(v=>v!==undefined&&Number.isFinite(Number(v))).map(Number);
    if(!vals.length){$("trendLatest").innerHTML='-- <small>'+units[key]+'</small>';$("trendRange").textContent="Waiting for readings";return}
    const lo=Math.min(...vals),hi=Math.max(...vals),span=Math.max(1,hi-lo),min=lo-span*.2,max=hi+span*.2;
    ctx.strokeStyle="#20364b";ctx.lineWidth=1;ctx.fillStyle="#71879e";ctx.font="9px DM Sans";
    for(let j=0;j<4;j++){const y=pad.t+(h-pad.t-pad.b)*j/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText((max-(max-min)*j/3).toFixed(key==="heartRate"||key==="spo2"?0:1),2,y+3)}
    const xAt=i=>pad.l+(w-pad.l-pad.r)*(vals.length===1?0:i/(vals.length-1)),yAt=v=>pad.t+(h-pad.t-pad.b)*(1-(v-min)/(max-min));
    ctx.beginPath();vals.forEach((v,i)=>i?ctx.lineTo(xAt(i),yAt(v)):ctx.moveTo(xAt(i),yAt(v)));ctx.strokeStyle="#4bd7c8";ctx.lineWidth=2;ctx.stroke();
    ctx.lineTo(xAt(vals.length-1),h-pad.b);ctx.lineTo(xAt(0),h-pad.b);ctx.closePath();const grad=ctx.createLinearGradient(0,pad.t,0,h);grad.addColorStop(0,"#45d6c833");grad.addColorStop(1,"#45d6c800");ctx.fillStyle=grad;ctx.fill();
    $("trendTitle").textContent=labels[key];$("trendLatest").innerHTML=fmt(vals[vals.length-1],key==="heartRate"||key==="spo2"?0:1)+' <small>'+units[key]+'</small>';$("trendRange").textContent=`Min ${fmt(lo,1)} · Max ${fmt(hi,1)} · ${vals.length} samples`;
  }
  function renderTrend(){drawTrend()}
  $("configForm").addEventListener("submit",async e=>{
    e.preventDefault();state.channelId=$("channelId").value.trim();state.readKey=$("readKey").value.trim();state.interval=Number($("refreshInterval").value);
    state.map={heartRate:$("mapHeart").value,spo2:$("mapSpo2").value,temperature:$("mapTemp").value,probeTemp:$("mapProbe").value,ecg:$("mapEcg").value,motion:$("mapMotion").value};
    state.mode=$("dataMode").value;saveConfig();clearInterval(state.timer);
    if(state.mode==="demo"){startDemo();toast("Demo preview started");return}
    try{$("configMessage").textContent="Connecting…";await fetchThingSpeak();updateModeUI();state.timer=setInterval(async()=>{try{await fetchThingSpeak()}catch(err){$("cloudStatus").textContent="Read error";$("configMessage").textContent=err.message}},state.interval);toast("ThingSpeak connected")}
    catch(err){$("configMessage").textContent=err.message;$("cloudStatus").textContent="Connection error";$("connectionBadge").textContent="ERROR";$("connectionBadge").classList.remove("online");toast(err.message)}
  });
  $("demoBtn").addEventListener("click",()=>{startDemo();toast("Demo preview loaded")});
  $("refreshBtn").addEventListener("click",async()=>{if(state.mode==="demo"){applyReading(demoReading(),new Date().toISOString());toast("Demo readings refreshed")}else{try{await fetchThingSpeak();toast("Readings refreshed")}catch(e){toast(e.message)}}});
  $("trendMetric").addEventListener("change",renderTrend);
  $("dismissNotice").addEventListener("click",()=>$("demoNotice").style.display="none");
  $("menuBtn").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  document.querySelectorAll(".nav-link").forEach(a=>a.addEventListener("click",()=>$("sidebar").classList.remove("open")));
  window.addEventListener("resize",()=>{drawEcg();drawTrend()});
  loadConfig();updateModeUI();renderAlerts();
  if(state.mode==="thingspeak"&&state.channelId){
    $("dataMode").value="thingspeak";$("configMessage").textContent="Restoring saved connection…";
    fetchThingSpeak().then(()=>{state.timer=setInterval(()=>fetchThingSpeak().catch(e=>$("configMessage").textContent=e.message),state.interval)}).catch(e=>{state.mode="demo";startDemo();$("configMessage").textContent="Could not restore connection: "+e.message});
  }else startDemo();
})();
