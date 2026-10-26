// Run with Vite on 127.0.0.1:5173 and an isolated Chrome debugging on port 9231.
// All hotel API calls use fixtures; no reservations or payments are created.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
 const page=await (await fetch('http://127.0.0.1:9231/json/new?about:blank',{method:'PUT'})).json();
 const ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ ws.onopen=resolve;ws.onerror=reject; });
 let next=0; const pending=new Map(); const errors=[];
 function send(method,params={}) { return new Promise((resolve,reject)=>{ const id=++next; const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Timeout: '+method));},15000); pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params})); }); }
 ws.onmessage=async event=>{
  const message=JSON.parse(event.data);
  if(message.id){ const task=pending.get(message.id);if(!task)return;clearTimeout(task.timer);pending.delete(message.id);message.error?task.reject(new Error(JSON.stringify(message.error))):task.resolve(message.result); }
  if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
  if(message.method==='Fetch.requestPaused') {
   const {requestId,request}=message.params;
   const pathname=new URL(request.url).pathname;
   const room={id:'123456789012345678901234',name:'Standard Room',description:'Complimentary secure guest parking.',imageUrl:'',inventory:3,maxGuests:2,priceETB:6000,priceUSD:40,active:true};
   const config={name:'Ayele Degu International Hotel',email:'hotel@example.com',phone:'+251900000000',address:'Dilla Town, Gedeo Zone, Ethiopia',location:{latitude:6.4083,longitude:38.3104},directionsUrl:'https://maps.google.com',paymentMethods:{chapa:true,stripe:true},authenticationMethods:{google:false}};
   const body=pathname.endsWith('/config')?config:pathname.endsWith('/rooms')?{rooms:[room]}:request.url.includes('open.er-api.com')?{result:'success',time_last_update_utc:'Mon, 26 Oct 2026 00:00:00 +0000',rates:{ETB:160}}:{};
   try {
    await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
   } catch(error) { if(!error.message.includes('Invalid InterceptionId'))throw error; }
  }
 };
 const evaluate=async expression=>{ const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value; };
 const until=async expression=>{for(let i=0;i<120;i++){try{if(await evaluate(`Boolean(${expression})`))return;}catch{}await pause(150);}throw new Error('Not ready: '+expression);};
 await send('Runtime.enable');await send('Page.enable');
 await send('Fetch.enable',{patterns:[{urlPattern:'*://127.0.0.1:5173/api/*'},{urlPattern:'*://open.er-api.com/*'}]});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:5173/contact'});
 await until('document.querySelector(".language-trigger") && !document.querySelector(".navigation-loader")');
 await evaluate('localStorage.removeItem("ayele-hotel-language")');
 async function choose(code) {
  await evaluate('document.querySelector(".language-trigger").click()');
  await until('document.querySelector(".language-dropdown")');
  await evaluate(`document.querySelector('.language-group button[lang="${code}"]').click()`);
  await until(`document.documentElement.lang === '${code}' && !document.querySelector('.language-dropdown')`);
 }
 await choose('en');
 assert.ok(await evaluate('document.querySelector(".site-nav .nav-cta").getBoundingClientRect().right <= document.querySelector(".language-trigger").getBoundingClientRect().left'),'Desktop language selector follows Book Now');
 await evaluate('document.querySelector(".support-form input").value = "Test Visitor"');
 const expected={fr:'Chambres',ar:'الغرف',am:'ክፍሎች',om:'Kutaalee',en:'Rooms'};
 for(const code of ['fr','ar','am','om','en']) {
  await choose(code);
  assert.equal(await evaluate('document.querySelector(".site-nav a").textContent'),expected[code]);
  assert.equal(await evaluate('document.querySelector(".support-form input").value'),'Test Visitor');
  assert.equal(await evaluate('document.documentElement.dir'),code==='ar'?'rtl':'ltr');
 }
 await choose('fr');
 await send('Page.reload');await until('document.querySelector(".language-trigger") && !document.querySelector(".navigation-loader")');
 assert.equal(await evaluate('document.documentElement.lang'),'fr');
 assert.equal(await evaluate('document.querySelector(".site-nav a").textContent'),'Chambres');
 // Escape closes the picker and restores keyboard focus.
 await evaluate('document.querySelector(".language-trigger").click()');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await until('!document.querySelector(".language-dropdown")');
 assert.ok(await evaluate('document.activeElement === document.querySelector(".language-trigger")'));
 fs.mkdirSync('artifacts',{recursive:true});
 fs.writeFileSync('artifacts/language-desktop-fr.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await choose('en');
 assert.ok(await evaluate('document.querySelector(".language-trigger").getBoundingClientRect().right < document.querySelector(".menu-toggle").getBoundingClientRect().left'),'Mobile language button precedes menu');
 await choose('ar');
 await evaluate('document.querySelector(".language-trigger").click()');
 const dropdown=await evaluate('(()=>{const r=document.querySelector(".language-dropdown").getBoundingClientRect();return {left:r.left,right:r.right}})()');
 assert.ok(dropdown.left>=0 && dropdown.right<=390,'Mobile dropdown stays inside viewport');
 fs.writeFileSync('artifacts/language-mobile-ar.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await evaluate('document.querySelector(".language-trigger").click()');
 await choose('om');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await evaluate('document.querySelector(".nav-cta").click()');await until('document.querySelector("#roomId") && !document.querySelector(".navigation-loader")');
 await evaluate('document.querySelector("#roomId").click()');
 await until('document.querySelector(".room-option")');
 assert.equal(await evaluate('document.querySelector(".room-option").textContent.includes("Kutaa idilee")'),true);
 fs.writeFileSync('artifacts/modern-room-dropdown.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await until('document.activeElement.matches(".room-option")');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await until('!document.querySelector(".room-options")');
 await choose('fr');
 assert.equal(await evaluate('document.querySelector("#roomId").textContent.includes("Chambre standard")'),true);
 await evaluate('document.querySelector(".support-chat-launcher").click()');
 await until('document.querySelector(".support-chat-topics button")');
 await evaluate('document.querySelectorAll(".support-chat-topics button")[1].click()');
 await until('document.querySelector(".support-chat-messages").textContent.includes("Types de chambres disponibles")');
 await evaluate('document.querySelector(".support-chat-close").click()');
 await evaluate('document.querySelector(".booking-step-actions .button").click()');
 await until('document.querySelector("#checkIn")');
 await evaluate('document.querySelector("#checkIn").click()');
 await until('document.querySelector(".calendar-day:focus")');
 fs.writeFileSync('artifacts/modern-calendar.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
 const arrival = await evaluate('document.querySelector(".calendar-day:focus").dataset.date');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await until('!document.querySelector(".date-popover")');
 await evaluate('document.querySelector("#checkOut").click()');
 await until('document.querySelector(".calendar-day:focus")');
 const departure = await evaluate('document.querySelector(".calendar-day:focus").dataset.date');
 assert.ok(departure>arrival,'Checkout starts after check-in');
 assert.equal(await evaluate(`Array.from(document.querySelectorAll('.calendar-day')).filter(b=>b.dataset.date <= '${arrival}').every(b=>b.disabled)`),true,'Earlier checkout dates are disabled');
 await evaluate('document.querySelector(".calendar-day:focus").click()');
 await until('!document.querySelector(".date-popover")');
 for(const width of [320,820,1024,1200]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<1101});
  const bounds=await evaluate('(()=>{const r=document.querySelector(".language-trigger").getBoundingClientRect();return {left:r.left,right:r.right,overflow:document.documentElement.scrollWidth>innerWidth}})()');
  assert.ok(bounds.left>=0 && bounds.right<=width,`Language selector fits at ${width}px`);
  assert.equal(bounds.overflow,false,`No horizontal overflow at ${width}px`);
  await evaluate('document.querySelector("#checkOut").click()');
  await until('document.querySelector(".date-popover")');
  const calendar=await evaluate('(()=>{const r=document.querySelector(".date-popover").getBoundingClientRect();return {left:r.left,right:r.right}})()');
  assert.ok(calendar.left>=0 && calendar.right<=width,`Calendar fits at ${width}px`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until('!document.querySelector(".date-popover")');
 }
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: five languages, desktop/mobile placement, RTL, saved preference, form preservation, booking room translation, Escape focus and no runtime exceptions.');
 await send('Page.close');ws.close();
})().catch(error=>{console.error(error);process.exit(1);});
