const fs = require('fs');
const dictionary = {};
for (const line of fs.readFileSync('frontend/src/i18n/translations.tsv','utf8').split(/\r?\n/).filter(Boolean)) {
 const [en,fr,ar,am,om,...extra]=line.split('|');
 if(!en||!fr||!ar||!am||!om||extra.length)throw new Error('Invalid translation row: '+en);
 if(dictionary[en])throw new Error('Duplicate translation: '+en);
 dictionary[en]={fr,ar,am,om};
}
fs.writeFileSync('frontend/src/i18n/translations.json',JSON.stringify(dictionary,null,2)+'\n');
console.log('Bundled '+Object.keys(dictionary).length+' phrases in four languages.');
