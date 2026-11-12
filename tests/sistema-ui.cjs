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
(async()=>{
  const url=await start();
  browser=await chromium.launch({headless:true,...(process.env.PR_BROWSER?{executablePath:process.env.PR_BROWSER}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const login=async code=>{
    await page.getByLabel('Código de acesso',{exact:true}).fill(code);await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('#navigation nav')));
    if(await page.getByRole('button',{name:'Agora não',exact:true}).isVisible())await page.getByRole('button',{name:'Agora não',exact:true}).click();
  };
  const menu=async()=>{const button=page.getByRole('button',{name:'Menu',exact:true});if(await button.isVisible() && await button.getAttribute('aria-expanded')==='false')await button.click();};
  const nav=async name=>{await menu();await page.getByRole('navigation').getByRole('link',{name,exact:true}).click();await page.getByRole('heading',{level:1,name:name==='Consultas'?'Consultas do residencial':name,exact:true}).waitFor();};
  const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const capture=async name=>{fs.mkdirSync(path.join(__dirname,'../docs/screenshots'),{recursive:true});await page.screenshot({path:path.join(__dirname,`../docs/screenshots/${name}.png`),fullPage:true});};
  await page.goto(url);await login('demo-morador-1');
  await page.getByRole('heading',{level:1,name:'Início',exact:true}).waitFor();
  const sidebar=page.locator('#navigation');const sidebox=await sidebar.boundingBox();const mainbox=await page.locator('#main').boundingBox();
  assert.equal(sidebox.x,0);assert.ok(sidebox.width>=220 && sidebox.width<=300);assert.ok(mainbox.x>=sidebox.width);
  assert.equal(await sidebar.evaluate(node=>getComputedStyle(node).position),'fixed');
  assert.deepEqual(await page.getByRole('navigation').getByRole('link').allTextContents(),['Início','Consultas','Acompanhamento','Minhas solicitações','Regras e contatos','Assistente']);
  assert.ok(await page.getByRole('heading',{name:'Como usar o sistema',exact:true}).isVisible());
  assert.equal(await page.locator('.usage-guide .guide-step').count(),4);
  assert.equal(await page.locator('body.admin').count(),0);
  assert.equal(await page.getByRole('link',{name:'Convites',exact:true}).count(),0);
  await overflow();await capture('sistema-morador-desktop');
  await page.locator('.usage-guide').getByRole('link',{name:'Ver consultas abertas',exact:true}).click();
  await page.getByRole('heading',{level:1,name:'Consultas do residencial',exact:true}).waitFor();
  await page.getByRole('button',{name:'Como usar o sistema',exact:true}).click();
  await page.getByRole('heading',{level:1,name:'Início',exact:true}).waitFor();
  await page.setViewportSize({width:375,height:812});
  await menu();await page.getByRole('navigation').getByRole('link',{name:'Minhas solicitações',exact:true}).click();
  await page.getByRole('heading',{level:1,name:'Minhas solicitações',exact:true}).waitFor();
  await page.waitForFunction(()=>document.activeElement.id==='main');
  assert.equal(await page.getByRole('button',{name:'Menu',exact:true}).getAttribute('aria-expanded'),'false');
  await menu();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'admin-menu');
  await nav('Início');await overflow();await capture('sistema-morador-mobile');
  await menu();await page.getByRole('button',{name:'Como usar o sistema',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement.id==='usage-guide-heading');
  assert.equal(await page.getByRole('button',{name:'Menu',exact:true}).getAttribute('aria-expanded'),'false');
  await menu();await page.getByRole('button',{name:'Sair',exact:true}).click();
  await login('demo-gestao');await page.getByRole('heading',{level:1,name:'Visão geral',exact:true}).waitFor();
  assert.equal(await page.locator('.usage-guide .guide-step').count(),3);
  assert.ok(await page.locator('.usage-guide').getByRole('link',{name:'Ver Devolutivas',exact:true}).isVisible());
  await page.setViewportSize({width:1280,height:900});await overflow();await capture('sistema-gestao-desktop');
  await page.locator('.usage-guide').getByRole('link',{name:'Ver Devolutivas',exact:true}).click();await page.getByRole('heading',{level:1,name:'Devolutivas',exact:true}).waitFor();
  await page.getByRole('button',{name:'Sair',exact:true}).click();
  assert.equal(await page.locator('body.app-shell').count(),0);
  assert.ok(await page.getByRole('heading',{level:1,name:'Sua opinião conta. O retorno também.',exact:true}).isVisible());
  assert.deepEqual(errors,[]);
  console.log('OK: menu lateral e guias permanentes dos dois perfis; início do morador; atalhos reais; menu móvel/Esc/foco; perfis separados; login restaurado; 375/1280 sem overflow.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();fs.rmSync(tmp,{recursive:true,force:true});});
