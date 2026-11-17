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
  child = spawn('python3', [process.env.PR_GEMINI_FAILURE==='1' || process.env.PR_EVENTS_SIMULATED==='1'?'tests/gemini_stub_server.py':'demo.py'], {cwd:path.join(__dirname,'..'),env:{...process.env,RESIDENCIAL_DB:path.join(tmp,'ui.sqlite3'),RESIDENCIAL_PORT:'0',GEMINI_API_KEY:'',GEMINI_MODEL:''}});
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
  await page.goto(url);await page.getByLabel('Código de acesso',{exact:true}).fill('demo-morador-1');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('button',{name:'Pergunte ao assistente',exact:true}).click();
  const expected=process.env.PR_EVENTS_SIMULATED==='1'?'Resposta do Gemini':'Orientações locais do PR';
  const cases=[
    ['Quem cuida dos eventos?','Administração e Diretoria Social','#regras'],
    ['Com quem eu falo sobre festas?','Administração e Diretoria Social','#regras'],
    ['O que a gestão decidiu sobre o evento?','ainda não foi publicada','#consulta/1'],
    ['Até que horas posso usar o salão?','22h','#regras/artigo/3']
  ];
  for(const [question,answer,href] of cases) {
    await page.getByLabel('Mensagem',{exact:true}).fill(question);await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#pr-chat-message').hasAttribute('aria-busy'));
    const reply=page.locator('.pr-chat-assistant').last();await reply.getByText(expected,{exact:true}).waitFor();
    assert.ok((await reply.innerText()).includes(answer));assert.equal(await reply.locator('a').count(),1);assert.equal(await reply.locator('a').getAttribute('href'),href);
  }
  await page.locator('.pr-chat-assistant').filter({has:page.getByRole('link',{name:'Canais por assunto',exact:true})}).first().getByRole('link',{name:'Canais por assunto',exact:true}).click();
  const events=page.locator('.channel').filter({has:page.getByRole('heading',{name:'Eventos',exact:true})});
  await events.getByText('Administração e Diretoria Social',{exact:true}).waitFor();await events.getByText('Contato: A informar',{exact:true}).waitFor();
  await page.setViewportSize({width:375,height:568});await page.getByRole('button',{name:'Pergunte ao assistente',exact:true}).click();await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'Pergunte ao assistente',exact:true}).evaluate(n=>n===document.activeElement),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log('OK: 4 perguntas, fonte única por intenção, áreas sem funções inventadas, canal compartilhado, devolutiva ausente, regulamento, desktop/celular/Esc; '+expected+(process.env.PR_EVENTS_SIMULATED==='1'?' (SIMULADO)':'')+'.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();fs.rmSync(tmp,{recursive:true,force:true});});
