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
  const capture=async name=>{fs.mkdirSync(path.join(__dirname,'../docs/screenshots'),{recursive:true});await page.screenshot({path:path.join(__dirname,`../docs/screenshots/${name}.png`),fullPage:false});};
  await login(page,'demo-morador-1');
  const open=async p=>{await p.getByRole('button',{name:'Pergunte ao assistente',exact:true}).click();await p.getByRole('dialog',{name:'Assistente do Residencial'}).waitFor();};
  const send=async text=>{await page.getByLabel('Mensagem',{exact:true}).fill(text);await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();};
  for(const [width,height] of [[1280,900],[375,812],[375,568]]) {
    await page.setViewportSize({width,height});
    for(const hash of ['inicio','consultas','solicitacoes','regras']) {
      await page.evaluate(hash=>{location.hash=hash;},hash);
      await page.waitForTimeout(100);
      for(const atBottom of [false,true]) {
        await page.evaluate(bottom=>scrollTo(0,bottom?document.body.scrollHeight:0),atBottom);
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(()=>{
          const a=document.querySelector('.pr-chat-launcher').getBoundingClientRect();
          return [...document.querySelectorAll('#main button,#main a[href],#main input,#main textarea,#main select')].filter(n=>n.getClientRects().length).some(n=>{
            const b=n.getBoundingClientRect();return b.right>a.left && b.left<a.right && b.bottom>a.top && b.top<a.bottom;
          });
        }),false,'Botão flutuante não deve cobrir controles');
      }
    }
  }
  await page.setViewportSize({width:1280,height:900});
  const currentHash=await page.evaluate(()=>location.hash);
  await open(page);assert.equal(await page.evaluate(()=>location.hash),currentHash);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#pr-assistant-panel').isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'Pergunte ao assistente',exact:true}).evaluate(n=>n===document.activeElement),true);
  await open(page);
  await page.getByRole('button',{name:'Quais consultas estão abertas?',exact:true}).waitFor();
  await page.getByRole('button',{name:'O que a gestão decidiu sobre o evento?',exact:true}).waitFor();
  await send('O que foi decidido sobre iluminação?');
  await page.locator('#pr-assistant-panel').getByText(process.env.PR_GEMINI_SIMULATED==='1'?'Resposta do Gemini':'Orientações locais do PR',{exact:true}).waitFor();
  await page.locator('#pr-assistant-panel').getByRole('link',{name:/Melhorias da área comum/}).click();
  await page.getByRole('heading',{level:1,name:'Melhorias da área comum',exact:true}).waitFor();
  await open(page);await send('Qual a previsão de meteoros em Marte?');
  await page.getByText(/Não encontrei informação publicada/).waitFor();
  await send('Qual o contato para limpeza?');
  await page.waitForFunction(()=>!document.querySelector('#pr-chat-message').hasAttribute('aria-busy'));
  assert.equal(await page.getByLabel('Local do chamado',{exact:true}).count(),0);
  await page.locator('#pr-assistant-panel').getByRole('link',{name:'Canais por assunto',exact:true}).last().waitFor();
  await send('A academia está suja');
  await page.getByLabel('Local do chamado',{exact:true}).fill('Academia');
  await page.getByLabel('Descrição do chamado',{exact:true}).fill('A academia está suja');
  assert.equal(await page.getByLabel('Equipe de destino',{exact:true}).inputValue(),'Equipe de limpeza');
  const before=await page.request.get(url+'/api/requests',{headers:{Authorization:'Bearer demo-morador-1'}});assert.deepEqual((await before.json()).requests,[]);
  await page.setViewportSize({width:1280,height:900});await capture('assistente-flutuante-desktop');
  await page.setViewportSize({width:375,height:568});
  const bounds=await page.getByLabel('Mensagem',{exact:true}).boundingBox();assert.ok(bounds.y+bounds.height<=568);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture('assistente-flutuante-mobile');
  await page.setViewportSize({width:375,height:360});
  const keyboard=await page.getByLabel('Mensagem',{exact:true}).boundingBox();assert.ok(keyboard.y+keyboard.height<=360,'Campo acessível com viewport reduzida');
  await page.setViewportSize({width:375,height:568});
  await page.getByRole('button',{name:'Preparar chamado',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar chamado',exact:true}).evaluate(button=>{button.click();button.click();});
  await page.locator('#pr-assistant-panel').getByText(/Chamado confirmado/).waitFor();
  const card=page.locator('#pr-assistant-panel .request-card');await card.waitFor();const protocol=await card.getAttribute('data-protocol');
  await page.keyboard.press('Escape');
  await nav(page,'Minhas solicitações');
  await page.locator('#content .request-card').filter({hasText:protocol}).waitFor();
  await open(page);
  assert.match(protocol,/^SOL-[A-F0-9]{12}$/);assert.ok(await card.getByText('Pendente',{exact:true}).isVisible());
  const p2=await context.newPage();await login(p2,'demo-morador-2');await open(p2);assert.equal(await p2.locator('#pr-assistant-panel .request-card').count(),0);await p2.getByRole('button',{name:'Solicitar limpeza',exact:true}).click();await p2.getByLabel('Local do chamado').fill('Academia');await p2.getByLabel('Descrição do chamado').fill('Limpeza manual sem IA');
  assert.equal((await p2.request.get(url+'/api/requests/'+protocol,{headers:{Authorization:'Bearer demo-morador-2'}})).status(),404);
  const admin=await context.newPage();await login(admin,'demo-gestao');
  assert.equal(await admin.locator('#pr-assistant').count(),0);
  assert.equal(await admin.getByRole('navigation').getByRole('link',{name:'Assistente',exact:true}).count(),0);
  await nav(admin,'Fila de limpeza');const task=admin.locator('.order-card').filter({hasText:protocol});assert.equal(await admin.locator('.order-card').count(),1);
  await task.getByRole('link',{name:'Abrir tarefa',exact:true}).click();await admin.getByLabel('O que foi feito?',{exact:true}).fill('Aparelhos higienizados');await admin.getByRole('button',{name:'Confirmar conclusão',exact:true}).click();
  await admin.locator('#notice').filter({hasText:'Conclusão e devolutiva salvas'}).waitFor();
  await page.getByRole('button',{name:'Atualizar meus chamados',exact:true}).click();
  await card.getByText('Concluída',{exact:true}).waitFor();assert.ok(await card.getByText('Aparelhos higienizados',{exact:true}).isVisible());
  assert.equal(await page.locator('#pr-assistant-panel .request-card').count(),1);await capture('assistente-flutuante-retorno-mobile');
  await page.reload();await page.getByLabel('Código de acesso',{exact:true}).fill('demo-morador-1');await page.getByRole('button',{name:'Entrar',exact:true}).click();await open(page);await page.getByRole('button',{name:'Atualizar meus chamados',exact:true}).click();
  await page.locator('#pr-assistant-panel .request-card').getByText('Aparelhos higienizados',{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.route('**/api/assistant/question',route=>route.abort());
  await send('O que foi decidido sobre iluminação?');
  await page.locator('#pr-assistant-panel').getByText(/Não foi possível conectar/).waitFor();
  await page.unroute('**/api/assistant/question');
  // Resposta atrasada deve desaparecer ao sair, sem atravessar sessões.
  let release;const waiting=new Promise(resolve=>release=resolve);
  await page.route('**/api/assistant/question',async route=>{await waiting;await route.fulfill({json:{mode:'local',answer:'Resposta da sessão anterior',sources:[]}});});
  await send('O que foi decidido sobre iluminação?');await page.getByText('Consultando as informações publicadas…',{exact:true}).waitFor();
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Sair',exact:true}).click();
  release();await login(page,'demo-morador-2');await open(page);
  assert.equal(await page.getByText('Resposta da sessão anterior',{exact:true}).count(),0);
  assert.equal(await page.locator('#pr-assistant-panel .request-card').count(),0);
  assert.deepEqual(errors,[]);
  console.log('OK: origem '+(process.env.PR_GEMINI_SIMULATED==='1'?'Gemini simulado':'orientações locais')+'; dúvidas com fonte/sem dados; limpeza manual e por mensagem; prévia/confirmar/fila/conclusão; privacidade; sincronização; Esc/foco; botão sem sobreposição; 375/1280 e altura 360; erro de rede e logout pendente.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();fs.rmSync(tmp,{recursive:true,force:true});});
