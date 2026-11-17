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
  child = spawn('python3', [process.env.PR_GEMINI_FAILURE==='1'?'tests/gemini_stub_server.py':'demo.py'], {cwd:path.join(__dirname,'..'),env:{...process.env,RESIDENCIAL_DB:path.join(tmp,'ui.sqlite3'),RESIDENCIAL_PORT:'0',GEMINI_API_KEY:'',GEMINI_MODEL:''}});
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
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const login=async(p,code)=>{
    await p.goto(url);await p.getByLabel('Código de acesso',{exact:true}).fill(code);await p.getByRole('button',{name:'Entrar',exact:true}).click();
    await p.waitForFunction(()=>Boolean(document.querySelector('#navigation nav')));
    if(await p.getByRole('button',{name:'Agora não',exact:true}).isVisible())await p.getByRole('button',{name:'Agora não',exact:true}).click();
  };
  const open=async p=>{await p.getByRole('button',{name:'Pergunte ao assistente',exact:true}).click();};
  const ask=async text=>{
    await page.getByLabel('Mensagem',{exact:true}).fill(text);await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#pr-chat-message').hasAttribute('aria-busy'));
    return page.locator('#pr-assistant-panel .pr-chat-assistant').last();
  };
  await login(page,'demo-morador-1');await open(page);
  let reply=await ask('Até que horas posso ficar no salão de festas?');
  assert.match(await reply.innerText(),/22h/);
  await reply.getByText('Orientações locais do PR',{exact:true}).waitFor();
  await reply.getByRole('link',{name:/Regulamento Interno.*v1.0, art. 3º/}).click();
  await page.waitForFunction(()=>location.hash==='#regras/artigo/3');
  await page.locator('#regulation-article-3').waitFor();
  assert.equal(await page.locator('#regulation-article-3').evaluate(n=>n===document.activeElement),true);
  assert.equal(await page.locator('#pr-assistant-panel').isVisible(),false);
  assert.equal(await page.locator('#content').getByRole('heading',{level:2}).count(),12);
  await page.getByText('Material fictício para a demonstração acadêmica da FIAP, GS2 CitizenTech.',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Voltar a Regras e contatos',exact:true}).click();
  await page.getByRole('link',{name:'Ler regulamento',exact:true}).waitFor();
  await open(page);
  reply=await ask('Quanto tempo antes preciso reservar o salão?');assert.match(await reply.innerText(),/três dias corridos/);
  await reply.getByRole('link',{name:/v1.0, art. 4º/}).waitFor();
  reply=await ask('Quanto custa reservar o salão?');assert.match(await reply.innerText(),/não traz essa informação/);
  assert.match(await reply.innerText(),/Administração/);assert.ok(!(await reply.innerText()).includes('800'));
  await reply.getByRole('link',{name:'Canais por assunto',exact:true}).waitFor();
  reply=await ask('Já decidiram quanto custa reservar o salão de festas?');assert.match(await reply.innerText(),/não traz essa informação/);
  reply=await ask('Posso limpar os equipamentos da academia?');assert.match(await reply.innerText(),/higienizar/);assert.equal(await page.getByLabel('Local do chamado').count(),0);
  reply=await ask('Como peço limpeza?');assert.match(await reply.innerText(),/local/);
  await reply.getByRole('link',{name:/v1.0, art. 7º/}).waitFor();
  assert.equal(await page.getByLabel('Local do chamado').count(),0);
  assert.deepEqual((await (await page.request.get(url+'/api/requests',{headers:{Authorization:'Bearer demo-morador-1'}})).json()).requests,[]);
  reply=await ask('Que horas a academia abre?');assert.match(await reply.innerText(),/6h às 22h/);
  await reply.getByRole('link',{name:/v1.0, art. 5º/}).waitFor();
  reply=await ask('Qual o horario de funcionamento da academia?');assert.match(await reply.innerText(),/6h às 22h/);
  reply=await ask('Qual o horário de funcionamento?');assert.match(await reply.innerText(),/salão de festas ou da academia/);
  reply=await ask('Quais consultas estão abertas?');assert.match(await reply.innerText(),/Formato e decoração de um evento/);
  reply=await ask('O que foi decidido sobre iluminação?');assert.match(await reply.innerText(),/Priorizar a melhoria da iluminação/);
  // Uma mensagem de ação oferece o formulário; ainda não cria chamado nem rascunho no banco.
  await ask('A academia precisa de limpeza');
  assert.equal(await page.getByLabel('Local do chamado',{exact:true}).inputValue(),'Academia');
  await page.getByLabel('Descrição do chamado',{exact:true}).fill('Higienizar os aparelhos — dados fictícios');
  assert.deepEqual((await (await page.request.get(url+'/api/requests',{headers:{Authorization:'Bearer demo-morador-1'}})).json()).requests,[]);
  await page.getByRole('button',{name:'Preparar chamado',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar chamado',exact:true}).evaluate(n=>{n.click();n.click();});
  const card=page.locator('#pr-assistant-panel .request-card');await card.waitFor();const protocol=await card.getAttribute('data-protocol');
  reply=await ask('Qual o status do meu chamado '+protocol+'?');assert.match(await reply.innerText(),/Pendente/);
  const other=await context.newPage();await login(other,'demo-morador-2');await open(other);
  await other.getByLabel('Mensagem',{exact:true}).fill('Qual o status do chamado '+protocol+'?');await other.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  await other.getByText('Esse chamado não foi encontrado para a sua residência.',{exact:true}).waitFor();
  assert.equal((await other.request.get(url+'/api/requests/'+protocol,{headers:{Authorization:'Bearer demo-morador-2'}})).status(),404);
  const admin=await context.newPage();await login(admin,'demo-gestao');
  await admin.getByRole('navigation').getByRole('link',{name:'Fila de limpeza',exact:true}).click();
  await admin.locator('.order-card').filter({hasText:protocol}).waitFor();assert.equal(await admin.locator('.order-card').count(),1);
  // Responsividade, Esc e link para artigo no celular.
  await page.setViewportSize({width:375,height:568});
  reply=await ask('Até que horas posso ficar no salão de festas?');
  await reply.getByRole('link',{name:/v1.0, art. 3º/}).click();
  await page.locator('#regulation-article-3').waitFor();
  assert.equal(await page.locator('#regulation-article-3').evaluate(n=>n===document.activeElement),true);
  await open(page);await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'Pergunte ao assistente',exact:true}).evaluate(n=>n===document.activeElement),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // Link de artigo sobrevive ao reload/login e é retomado com foco.
  await page.reload();await page.getByLabel('Código de acesso',{exact:true}).fill('demo-morador-1');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.id==='regulation-article-3');
  assert.deepEqual(errors,[]);
  console.log('OK: regulamento compartilhado, artigos 3/4/5/7, preço ausente, ambiguidade, consultas/devolutivas, orientação sem ação, resumo/confirmar/fila/protocolo privado; desktop/celular, Esc/foco, link após login; '+(process.env.PR_GEMINI_FAILURE==='1'?'falha Gemini simulada':'sem chave')+'.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();fs.rmSync(tmp,{recursive:true,force:true});});
