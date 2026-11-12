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
  child = spawn('python3', [process.env.PR_GEMINI_SIMULATED==='1'?'tests/gemini_stub_server.py':'demo.py'], {cwd:path.join(__dirname,'..'),env:{...process.env,RESIDENCIAL_DB:path.join(tmp,'ui.sqlite3'),RESIDENCIAL_PORT:'0',GEMINI_API_KEY:'',GEMINI_MODEL:''}});
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
  const url=await start();browser=await chromium.launch({headless:true,...(process.env.PR_BROWSER?{executablePath:process.env.PR_BROWSER}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const login=async(p,code)=>{await p.goto(url);await p.getByLabel('Código de acesso',{exact:true}).fill(code);await p.getByRole('button',{name:'Entrar',exact:true}).click();await p.waitForFunction(()=>Boolean(document.querySelector('#navigation nav')));if(await p.getByRole('button',{name:'Agora não',exact:true}).isVisible())await p.getByRole('button',{name:'Agora não',exact:true}).click();};
  const nav=async(p,name)=>{const menu=p.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible() && await menu.getAttribute('aria-expanded')==='false')await menu.click();await p.getByRole('navigation').getByRole('link',{name,exact:true}).click();await p.getByRole('heading',{level:1,name,exact:true}).waitFor();};
  const capture=async name=>{fs.mkdirSync(path.join(__dirname,'../docs/screenshots'),{recursive:true});await page.screenshot({path:path.join(__dirname,`../docs/screenshots/${name}.png`),fullPage:true});};
  await login(page,'demo-morador-1');await nav(page,'Assistente');
  await page.getByRole('button',{name:'Tirar uma dúvida',exact:true}).click();
  await page.getByLabel('Sua dúvida',{exact:true}).fill('O que foi decidido sobre iluminação?');await page.getByRole('button',{name:'Consultar informações',exact:true}).click();
  await page.locator('.assistant-answer').getByText(process.env.PR_GEMINI_SIMULATED==='1'?'Resposta do Gemini':'Orientações locais do PR',{exact:true}).waitFor();
  if(process.env.PR_GEMINI_SIMULATED!=='1')await page.locator('.assistant-answer').getByText(/IA está indisponível/).waitFor();
  await page.locator('.assistant-answer').getByRole('link',{name:'Melhorias da área comum',exact:true}).click();
  await page.getByRole('heading',{level:1,name:'Melhorias da área comum',exact:true}).waitFor();
  await nav(page,'Assistente');await page.getByRole('button',{name:'Solicitar limpeza',exact:true}).click();
  await page.getByLabel('Mensagem sobre a limpeza',{exact:true}).fill('Está suja');await page.getByRole('button',{name:'Preparar chamado',exact:true}).click();
  await page.getByLabel('Local da solicitação',{exact:true}).waitFor();
  await page.getByLabel('Local da solicitação',{exact:true}).fill('Academia');await page.getByRole('button',{name:'Preparar chamado',exact:true}).click();
  await page.getByRole('heading',{name:'Confira antes de confirmar',exact:true}).waitFor();
  await page.getByRole('button',{name:'Voltar à mensagem',exact:true}).click();
  await page.getByLabel('Mensagem sobre a limpeza',{exact:true}).fill('Academia');
  await page.getByRole('button',{name:'Preparar chamado',exact:true}).click();await page.getByLabel('Descrição da solicitação',{exact:true}).waitFor();
  await page.getByLabel('Descrição da solicitação',{exact:true}).fill('A academia está suja');await page.getByRole('button',{name:'Preparar chamado',exact:true}).click();
  await page.getByRole('heading',{name:'Confira antes de confirmar',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Local do chamado',{exact:true}).inputValue(),'Academia');
  assert.equal(await page.getByLabel('Descrição do chamado',{exact:true}).inputValue(),'A academia está suja');
  assert.equal(await page.getByLabel('Equipe de destino',{exact:true}).inputValue(),'Equipe de limpeza');
  const before=await page.request.get(url+'/api/requests',{headers:{Authorization:'Bearer demo-morador-1'}});assert.deepEqual((await before.json()).requests,[]);
  await capture('assistente-resumo-desktop');
  await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture('assistente-resumo-mobile');
  // Edita o resumo antes de registrar; dois cliques síncronos não geram duas ordens.
  await page.getByLabel('Descrição do chamado',{exact:true}).fill('A academia está suja');
  await page.getByRole('button',{name:'Confirmar chamado',exact:true}).evaluate(button=>{button.click();button.click();});
  await page.locator('#notice').filter({hasText:'Chamado confirmado'}).waitFor();
  const card=page.locator('.assistant-requests .request-card');await card.waitFor();const protocol=await card.getAttribute('data-protocol');
  assert.match(protocol,/^SOL-[A-F0-9]{12}$/);assert.ok(await card.getByText('Pendente',{exact:true}).isVisible());
  const p2=await context.newPage();await login(p2,'demo-morador-2');await nav(p2,'Assistente');assert.equal(await p2.locator('.assistant-requests .request-card').count(),0);
  assert.equal((await p2.request.get(url+'/api/requests/'+protocol,{headers:{Authorization:'Bearer demo-morador-2'}})).status(),404);
  const admin=await context.newPage();await login(admin,'demo-gestao');
  assert.equal(await admin.getByRole('navigation').getByRole('link',{name:'Assistente',exact:true}).count(),0);
  await nav(admin,'Fila de limpeza');const task=admin.locator('.order-card').filter({hasText:protocol});assert.equal(await admin.locator('.order-card').count(),1);
  await task.getByRole('link',{name:'Abrir tarefa',exact:true}).click();await admin.getByLabel('O que foi feito?',{exact:true}).fill('Aparelhos higienizados');await admin.getByRole('button',{name:'Confirmar conclusão',exact:true}).click();
  await admin.locator('#notice').filter({hasText:'Conclusão e devolutiva salvas'}).waitFor();
  await page.getByRole('button',{name:'Atualizar meus chamados',exact:true}).click();
  await card.getByText('Concluída',{exact:true}).waitFor();assert.ok(await card.getByText('Aparelhos higienizados',{exact:true}).isVisible());
  assert.equal(await page.locator('.assistant-requests .request-card').count(),1);await capture('assistente-retorno-mobile');
  await page.reload();await page.getByLabel('Código de acesso',{exact:true}).fill('demo-morador-1');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('heading',{level:1,name:'Assistente',exact:true}).waitFor();
  await page.locator('.assistant-requests .request-card').getByText('Aparelhos higienizados',{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log('OK: origem '+(process.env.PR_GEMINI_SIMULATED==='1'?'Gemini simulado':'orientações locais')+'; dúvida com fontes; complementação; resumo editável sem OS antes da confirmação; duplo clique sem duplicar; fila existente/conclusão/retorno no assistente; privacidade; 375/1280 e recarregar.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();fs.rmSync(tmp,{recursive:true,force:true});});
