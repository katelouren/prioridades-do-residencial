// Optional: NODE_PATH=/tmp/residencial-browser/node_modules node tests/ui.cjs
const {chromium} = require('playwright');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-ui-'));
let child, browser;
async function start() {
  child = spawn('python3', ['demo.py'], {cwd:path.join(__dirname,'..'),env:{...process.env,RESIDENCIAL_DB:path.join(tmp,'ui.sqlite3'),RESIDENCIAL_PORT:'0'}});
  return new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>reject(new Error('Servidor não iniciou')),10000);
    child.stdout.on('data', data=>{output+=data; const match=output.match(/Abra (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    child.on('error',reject);
    child.on('exit',code=>{if(code)reject(new Error('Servidor encerrou: '+code));});
  });
}
async function stop() {
  if(!child || child.exitCode!==null)return;
  await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});
}
// Captura ou compara telas anteriores, desconsiderando apenas o link novo autorizado.
(async()=>{
  const url=await start();browser=await chromium.launch({headless:true,...(process.env.PR_BROWSER?{executablePath:process.env.PR_BROWSER}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(6000);
  const folder=process.env.PR_VISUAL_BASELINE;
  if(!folder)throw new Error('Informe PR_VISUAL_BASELINE para a pasta das capturas de referência.');
  fs.mkdirSync(folder,{recursive:true});
  const capture=async name=>{
    const entry=page.locator('#navigation a[href="#assistente"]');if(await entry.count())await entry.evaluate(node=>{node.hidden=true;});
    const file=path.join(folder,name+'.png');const png=await page.screenshot({fullPage:true,animations:'disabled'});
    if(process.env.PR_VISUAL_COMPARE==='1')assert.ok(fs.readFileSync(file).equals(png),`Tela preservada: ${name}`);else fs.writeFileSync(file,png);
    if(await entry.count())await entry.evaluate(node=>{node.hidden=false;});
  };
  const login=async code=>{await page.getByLabel('Código de acesso',{exact:true}).fill(code);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForFunction(()=>Boolean(document.querySelector('#navigation nav')));};
  const go=async(hash,title)=>{await page.goto(url+'#'+hash);await page.getByRole('heading',{level:1,name:title,exact:true}).waitFor();};
  await page.goto(url);await capture('login-desktop');await page.setViewportSize({width:375,height:812});await capture('login-mobile');await page.setViewportSize({width:1280,height:900});
  await login('demo-morador-1');await capture('morador-inicio');await go('consultas','Consultas do residencial');await capture('morador-consultas');
  await go('consulta/2','Formato e decoração de um evento');await capture('morador-detalhe');
  await go('solicitacoes','Minhas solicitações');await capture('morador-solicitacoes');
  await go('regras','Regras e contatos');await capture('morador-regras');
  await page.getByRole('button',{name:'Sair',exact:true}).click();await login('demo-gestao');await page.locator('#admin-intro').waitFor({state:'visible'});await capture('gestao-boas-vindas');
  await page.getByRole('button',{name:'Agora não',exact:true}).click();await capture('gestao-visao');await go('gestao/convites','Gerenciar convites');await capture('gestao-convites');
  await go('limpeza','Fila de limpeza');await capture('gestao-limpeza');
  console.log(process.env.PR_VISUAL_COMPARE==='1' ? 'OK: 11 capturas idênticas à referência; apenas o link Assistente foi desconsiderado.' : 'OK: 11 capturas de referência salvas antes das alterações.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();fs.rmSync(tmp,{recursive:true,force:true});});
