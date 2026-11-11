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
  let url=await start();
  browser=await chromium.launch({headless:true,...(process.env.PR_BROWSER ? {executablePath:process.env.PR_BROWSER}:{})});
  const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true});
  const page=await context.newPage();page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sem rolagem horizontal');
  const login=async code=>{
    await page.getByLabel('Código de acesso',{exact:true}).fill(code);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('#navigation nav')));
    if(await page.getByRole('button',{name:'Agora não',exact:true}).isVisible())await page.getByRole('button',{name:'Agora não',exact:true}).click();
  };
  const logout=async()=>{if(!await page.getByRole('button',{name:'Sair',exact:true}).isVisible())await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Sair',exact:true}).click();};
  const nav=async name=>{if(await page.getByRole('button',{name:'Menu',exact:true}).isVisible() && await page.getByRole('button',{name:'Menu',exact:true}).getAttribute('aria-expanded')==='false')await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('navigation').getByRole('link',{name,exact:true}).click();await page.getByRole('heading',{level:1,name,exact:true}).waitFor();};
  const capture=async name=>{fs.mkdirSync(path.join(__dirname,'../docs/screenshots'),{recursive:true});await page.screenshot({path:path.join(__dirname,`../docs/screenshots/${name}.png`),fullPage:true});};
  await page.goto(url);await login('demo-morador-1');await nav('Minhas solicitações');
  assert.ok(await page.getByText('Você ainda não tem solicitações.',{exact:true}).isVisible());
  assert.ok(await page.getByLabel('Local',{exact:true}).isEditable()===false);
  assert.equal(await page.getByLabel('Local',{exact:true}).inputValue(),'Academia');
  assert.equal(await page.getByLabel('Categoria',{exact:true}).inputValue(),'Higiene');
  await page.getByLabel('Descrição da solicitação',{exact:true}).fill('Os aparelhos da academia estão sujos');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Enviar solicitação');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid');
  await page.keyboard.press('Enter');
  await page.locator('#notice').filter({hasText:'Ordem de limpeza criada automaticamente'}).waitFor();
  const own=page.locator('.request-card');await own.waitFor();
  const protocol=await own.getAttribute('data-protocol');assert.match(protocol,/^SOL-[A-F0-9]{12}$/);
  assert.ok(await own.getByText('Pendente',{exact:true}).isVisible());
  assert.ok(await own.getByText('Os aparelhos da academia estão sujos',{exact:true}).isVisible());
  await overflow();await capture('limpeza-solicitacao-mobile');
  await page.setViewportSize({width:1280,height:900});await overflow();await capture('limpeza-solicitacao-desktop');
  await page.setViewportSize({width:375,height:812});
  await logout();await login('demo-morador-2');await nav('Minhas solicitações');
  assert.equal(await page.locator('.request-card').count(),0);
  assert.ok(await page.getByText('Você ainda não tem solicitações.',{exact:true}).isVisible());
  assert.equal((await page.request.get(url+'/api/requests/'+protocol,{headers:{Authorization:'Bearer demo-morador-2'}})).status(),404);
  await page.goto(url+'#limpeza/'+protocol);await page.getByRole('heading',{level:1,name:'Área exclusiva da gestão',exact:true}).waitFor();
  await logout();await login('demo-gestao');await nav('Fila de limpeza');
  const task=page.locator('.order-card').filter({hasText:protocol});await task.waitFor();
  assert.ok(await task.getByText('Os aparelhos da academia estão sujos',{exact:true}).isVisible());
  assert.ok(await task.getByText('Pendente',{exact:true}).isVisible());
  await overflow();await capture('limpeza-fila-mobile');
  await task.getByRole('link',{name:'Abrir tarefa',exact:true}).click();
  await page.getByRole('heading',{level:1,name:'Ordem '+protocol,exact:true}).waitFor();
  await page.getByLabel('O que foi feito?',{exact:true}).fill('Aparelhos higienizados');
  await page.getByRole('button',{name:'Confirmar conclusão',exact:true}).click();
  await page.locator('#notice').filter({hasText:'Conclusão e devolutiva salvas'}).waitFor();
  assert.ok(await page.getByText('Concluída',{exact:true}).isVisible());
  assert.ok(await page.getByText('Aparelhos higienizados',{exact:true}).isVisible());
  assert.equal(await page.getByRole('button',{name:'Confirmar conclusão'}).count(),0);
  await nav('Fila de limpeza');
  assert.ok(await task.getByText('Concluída',{exact:true}).isVisible());
  await stop();url=await start();await page.goto(url+'#solicitacoes');await login('demo-morador-1');
  await page.getByRole('heading',{level:1,name:'Minhas solicitações',exact:true}).waitFor();
  assert.equal(await page.locator('.request-card').getAttribute('data-protocol'),protocol);
  assert.ok(await own.getByText('Concluída',{exact:true}).isVisible());
  assert.ok(await own.getByText('Aparelhos higienizados',{exact:true}).isVisible());
  await overflow();await capture('limpeza-retorno-mobile');
  await logout();await login('demo-morador-2');await nav('Minhas solicitações');
  assert.equal(await page.locator('.request-card').count(),0);
  // Regressão local da GS2 na mesma base: ainda é possível participar das consultas.
  await page.getByRole('navigation').getByRole('link',{name:'Consultas',exact:true}).click();
  const survey=page.locator('.survey-summary').filter({hasText:'Formato e decoração de um evento'});
  await survey.getByRole('link',{name:'Responder',exact:true}).click();
  await page.getByRole('heading',{level:1,name:'Formato e decoração de um evento',exact:true}).waitFor();
  for(const group of await page.getByRole('group').all())await group.getByRole('radio').last().check();
  await page.getByRole('button',{name:'Confirmar participação',exact:true}).click();
  await page.getByRole('heading',{name:'Participação registrada',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('OK: solicitação demo-morador-1 → OS automática → gestão conclui → mesmo protocolo/devolutiva após reinício; demo-morador-2 isolado; GS2 funciona; teclado e 375/1280 sem overflow ou erros JS.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();fs.rmSync(tmp,{recursive:true,force:true});});
