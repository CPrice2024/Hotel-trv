const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const filename = path.resolve('frontend/src/i18n/language.ts');
const requireLocal = createRequire(filename);
const dictionary = requireLocal('./translations.json');
function load(saved = 'en') {
 const state = { saved, document: { documentElement: {} }, handlers: {} };
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText, {
  exports,
  require: name => name === 'react' ? {useSyncExternalStore: (_subscribe,get) => get()} : requireLocal(name),
  document: state.document,
  localStorage: {getItem:()=>state.saved,setItem:(_key,value)=>{state.saved=value;}},
  window:{addEventListener:(name,fn)=>{state.handlers[name]=fn;}},
 });
 return {api:exports,state};
}
test('every bundled phrase has all four translations with matching placeholders',()=>{
 for(const [key,values] of Object.entries(dictionary))for(const code of ['fr','ar','am','om']) {
  assert.ok(values[code], `${code}: ${key}`);
  assert.deepEqual((values[code].match(/\{\w+\}/g)||[]).sort(),(key.match(/\{\w+\}/g)||[]).sort(),`${code}: ${key}`);
 }
});
test('language preference updates document direction, persists and falls back safely',()=>{
 const {api,state}=load('invalid');assert.equal(api.useLanguage(),'en');
 api.setLanguage('ar');assert.equal(state.saved,'ar');assert.equal(state.document.documentElement.dir,'rtl');
 api.setLanguage('om');assert.equal(api.translateText('Rooms'),'Kutaalee');assert.equal(state.document.documentElement.dir,'ltr');
 state.saved='fr';state.handlers.storage({key:'ayele-hotel-language'});assert.equal(api.translateText('Rooms'),'Chambres');
});
test('translations preserve inline whitespace and unknown personal data',()=>{
 const {api}=load('fr');assert.equal(api.translateText(' Book Now '),' Réserver ');
 for(const value of ['visitor@example.com','123456789012345678901234','Test Visitor',42,null])assert.equal(api.translateText(value),value);
});
test('dynamic messages retain amounts and identifiers without interpreting punctuation',()=>{
 const {api}=load('fr');assert.equal(api.translateText('This room accommodates up to 3 guests per room.'),'Cette chambre accueille jusqu’à 3 personnes.');
 assert.equal(api.translateText('Phone: +251900000000'),'Téléphone : +251900000000');
 assert.equal(api.translateText('USD 40.00 / night'),'USD 40.00 / nuit');
 assert.equal(api.translateText('This room accommodates up to 3 guests per room!'),'This room accommodates up to 3 guests per room!');
});
test('chat labels and dates use the selected language',()=>{
 const {api}=load('fr');assert.equal(api.translateChatMessage('Room types currently listed:\n• Standard Room'),'Types de chambres disponibles :\n• Chambre standard');
 assert.match(api.formatStayDate('2026-11-01'),/nov/);
 assert.equal(api.formatStayDate('not-a-date'),'not-a-date');
});
