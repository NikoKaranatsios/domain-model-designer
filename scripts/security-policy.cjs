const {readFileSync, writeFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {createHash} = require('node:crypto');
const vm = require('node:vm');

const scripts = html => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1].replace(/\r\n?/g,'\n'));
function securityPolicy(html){
  const hashes = [...new Set(scripts(html).map(source=>"'sha256-"+createHash('sha256').update(source).digest('base64')+"'"))];
  return "default-src 'none'; script-src "+hashes.join(' ')+"; script-src-attr 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
}
function checkHTML(html,filename){
  scripts(html).forEach((source,index)=>new vm.Script(source,{filename:filename+' script '+(index+1)}));
  const expected=securityPolicy(html),actual=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/i)?.[1];
  if(actual!==expected)throw new Error(filename+': script hashes are out of date. Run node scripts/security-policy.cjs --write.');
  if(!/<meta name="referrer" content="no-referrer">/i.test(html))throw new Error(filename+': missing referrer policy.');
  return true;
}
if(require.main===module){
  for(const filename of ['index.html','FCP Domain Model.html']){
    const path=resolve(__dirname,'..',filename);let html=readFileSync(path,'utf8');
    if(process.argv.includes('--write')){
      html=html.replace(/\n?<meta http-equiv="Content-Security-Policy" content="[^"]*">/gi,'').replace(/\n?<meta name="referrer" content="[^"]*">/gi,'');
      const meta='<meta name="referrer" content="no-referrer">\n<meta http-equiv="Content-Security-Policy" content="'+securityPolicy(html)+'">';
      if(!/<meta charset\s*=/i.test(html))throw new Error(filename+': missing charset declaration.');
      html=html.replace(/(<meta charset\s*=[^>]+>)/i,'$1\n'+meta);writeFileSync(path,html);
    }
    checkHTML(html,filename);console.log(filename+': scripts parse and security policy matches.');
  }
}
module.exports={securityPolicy,checkHTML};
