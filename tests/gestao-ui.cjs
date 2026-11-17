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
  const api=async(path,data,code='demo-gestao')=>{
    const response=await page.request.fetch(url+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+code},...(data===undefined?{}:{data})});
    assert.ok(response.ok(),`${path}: ${response.status()}`);return response.json();
  };
  const login=async(code='demo-gestao')=>{
    await page.getByLabel('Código de acesso',{exact:true}).fill(code);await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('#navigation nav')));
  };
  const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sem overflow horizontal');
  const capture=async name=>{fs.mkdirSync(path.join(__dirname,'../docs/screenshots'),{recursive:true});await page.screenshot({path:path.join(__dirname,`../docs/screenshots/${name}.png`),fullPage:true});};
  const nav=async name=>{
    if(await page.getByRole('button',{name:'Menu',exact:true}).isVisible() && await page.getByRole('button',{name:'Menu',exact:true}).getAttribute('aria-expanded')==='false')await page.getByRole('button',{name:'Menu',exact:true}).click();
    await page.getByRole('navigation').getByRole('link',{name,exact:true}).click();
    await page.getByRole('heading',{level:1,name:name==='Convites'?'Gerenciar convites':name,exact:true}).waitFor();
  };
  const request=await api('/api/requests',{local:'Academia',category:'Higiene',description:'Pedido fictício para conferir pendências.'},'demo-morador-1');
  await page.goto(url);await login();
  await page.locator('h1').filter({hasText:'Visão geral'}).waitFor();
  const dialog=page.locator('#admin-intro');await dialog.waitFor({state:'visible'});
  assert.equal(await dialog.getByRole('heading',{name:'Boas-vindas ao painel da gestão',exact:true}).count(),1);
  await capture('gestao-boas-vindas');
  await dialog.getByRole('button',{name:'Agora não',exact:true}).click();
  assert.ok(await page.getByRole('heading',{level:1,name:'Visão geral',exact:true}).isVisible());
  assert.equal(await page.getByRole('navigation').getByRole('link').count(),5);
  assert.equal(await page.getByRole('navigation').getByRole('link',{name:'Visão geral',exact:true}).getAttribute('aria-current'),'page');
  assert.deepEqual(await page.locator('.admin-metric strong').allTextContents(),['1','1','1']);
  assert.equal(await page.locator('.attention-item').first().getAttribute('data-kind'),'cleaning');
  assert.ok(await page.locator('.attention-item').filter({hasText:'Calendário anual de eventos'}).getByRole('link',{name:'Publicar devolutiva',exact:true}).isVisible());
  await overflow();await capture('gestao-visao-geral-desktop');
  await page.getByRole('button',{name:'Como usar o painel',exact:true}).click();await dialog.getByRole('button',{name:'Fazer tour',exact:true}).click();
  await dialog.getByText('1 de 3',{exact:true}).waitFor();
  assert.equal(await page.locator('.tour-target').getAttribute('data-admin-section'),'visao-geral');
  // O foco permanece no diálogo ao percorrer os controles com Tab.
  for(let i=0;i<7;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('#admin-intro').contains(document.activeElement)));}
  await dialog.getByRole('button',{name:'Avançar',exact:true}).click();await dialog.getByText('2 de 3',{exact:true}).waitFor();
  assert.equal(await page.locator('.tour-target').getAttribute('id'),'admin-create-shortcut');
  await dialog.getByRole('button',{name:'Avançar',exact:true}).click();await dialog.getByText('3 de 3',{exact:true}).waitFor();
  assert.equal(await page.locator('.tour-target').getAttribute('data-admin-section'),'devolutivas');
  await dialog.getByRole('button',{name:'Voltar',exact:true}).click();await dialog.getByText('2 de 3',{exact:true}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'admin-help');
  // Ao reduzir a janela, um controle oculto da sidebar não pode reter o foco.
  await page.setViewportSize({width:375,height:812});
  await page.waitForFunction(()=>document.activeElement.id==='admin-menu');
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'Como usar o painel',exact:true}).click();
  await page.setViewportSize({width:375,height:812});
  await dialog.getByRole('button',{name:'Agora não',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'admin-menu');
  await page.setViewportSize({width:1280,height:900});
  // A preferência é a única informação guardada; o código nunca vai ao storage.
  const stored=await page.evaluate(()=>({...localStorage}));assert.deepEqual(stored,{'pr-gestao-introducao':'dispensada'});
  await page.reload();await login();assert.equal(await dialog.isVisible(),false);
  await page.getByRole('link',{name:'Criar consulta',exact:true}).click();
  await page.getByLabel('Título da consulta',{exact:true}).fill('Consulta pelo painel administrativo');
  await page.getByLabel('Contexto da consulta',{exact:true}).fill('Proposta fictícia para testar o painel.');
  await page.locator('#q-1').fill('Qual opção você prefere?');await page.locator('#options-1').fill('A\nB\nSem preferência');
  await page.getByRole('button',{name:'Publicar consulta',exact:true}).click();await page.locator('#notice').filter({hasText:'Consulta publicada'}).waitFor();
  const id=new URL(page.url()).hash.split('/')[1];
  await page.getByRole('button',{name:'Encerrar consulta',exact:true}).click();await page.getByRole('button',{name:'Confirmar encerramento',exact:true}).click();
  await page.getByLabel('Decisão da gestão',{exact:true}).fill('Decisão publicada pelo novo painel.');
  await page.getByLabel('Próximo passo (opcional)',{exact:true}).fill('Apresentar a proposta ao conselho.');
  await page.getByRole('button',{name:'Publicar devolutiva',exact:true}).click();await page.locator('#notice').filter({hasText:'disponível para os moradores'}).waitFor();
  await nav('Devolutivas');assert.ok(await page.getByRole('heading',{name:'Consulta pelo painel administrativo',exact:true}).isVisible());
  await nav('Convites');await page.getByLabel('Identificador da residência',{exact:false}).fill('DEMO-PAINEL');await page.getByRole('button',{name:'Gerar código de morador',exact:true}).click();await page.locator('output').filter({hasText:'Código gerado'}).waitFor();
  await nav('Consultas');assert.ok(await page.getByRole('heading',{name:'Formato e decoração de um evento',exact:true}).isVisible());
  await nav('Fila de limpeza');assert.ok(await page.getByText('Pedido fictício para conferir pendências.',{exact:true}).isVisible());
  await page.setViewportSize({width:375,height:812});
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.getByRole('navigation').getByRole('link',{name:'Visão geral',exact:true}).click();
  await page.getByRole('heading',{level:1,name:'Visão geral',exact:true}).waitFor();
  await page.waitForFunction(()=>document.activeElement.id==='main');
  assert.equal(await page.getByRole('button',{name:'Menu',exact:true}).getAttribute('aria-expanded'),'false');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'main');
  assert.ok(await page.evaluate(()=>document.querySelector('h1').getBoundingClientRect().top>=document.querySelector('#admin-header').getBoundingClientRect().bottom),'Título não fica sob o cabeçalho');await overflow();await capture('gestao-visao-geral-mobile');
  await page.getByRole('button',{name:'Menu',exact:true}).click();await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'admin-menu');
  for(const height of [812,568]) {
    await page.setViewportSize({width:375,height});
  if(await page.getByRole('button',{name:'Menu',exact:true}).getAttribute('aria-expanded')==='false')await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Como usar o painel',exact:true}).click();await dialog.getByRole('button',{name:'Fazer tour',exact:true}).click();
  for(let step=1;step<=3;step++){
    await dialog.getByText(`${step} de 3`,{exact:true}).waitFor();
    const overlap=await page.evaluate(()=>{
      const target=document.querySelector('.tour-target')?.getBoundingClientRect();const tip=document.querySelector('#admin-intro').getBoundingClientRect();
      return target && target.left<tip.right && target.right>tip.left && target.top<tip.bottom && target.bottom>tip.top;
    });assert.equal(overlap,false,'Instrução não cobre o alvo no celular');await overflow();
    if(step===2)await capture('gestao-tour-mobile');
    await dialog.getByRole('button',{name:step===3?'Concluir tour':'Avançar',exact:true}).click();
  }
  assert.equal(await dialog.isVisible(),false);
  }
  await page.setViewportSize({width:375,height:812});
  // Fallback de alvo ausente: o texto e os controles continuam disponíveis.
  await page.getByRole('button',{name:'Como usar o painel',exact:true}).click();await dialog.getByRole('button',{name:'Fazer tour',exact:true}).click();
  await page.locator('#admin-create-shortcut').evaluate(node=>node.remove());await dialog.getByRole('button',{name:'Avançar',exact:true}).click();
  await dialog.getByText('2 de 3',{exact:true}).waitFor();assert.equal(await page.locator('.tour-target').count(),0);await page.keyboard.press('Escape');
  // Esvazia pendências com ações reais da API e confere o estado vazio no painel.
  const surveys=(await api('/api/surveys')).surveys;
  for(const survey of surveys.filter(s=>s.closed && !s.response))await api(`/api/surveys/${survey.id}/response`,{response:'Retorno fictício publicado.',next_step:'Acompanhar execução.',subject_status:'Em andamento'});
  await api(`/api/cleaning/${request.request.protocol}/complete`,{feedback:'Limpeza fictícia concluída.'});
  await nav('Visão geral');await page.getByRole('button',{name:'Atualizar painel',exact:true}).click();await page.getByText('Nenhuma pendência no momento',{exact:true}).waitFor();
  // Morador vê o retorno publicado e recebe sua própria sidebar, sem opções ou introdução da gestão.
  await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Sair',exact:true}).click();await login('demo-morador-1');
  assert.equal(await page.locator('body.admin').count(),0);assert.equal(await page.getByRole('button',{name:'Como usar o painel',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Menu',exact:true}).isVisible(),true);
  await page.goto(url+'#consulta/'+id);await page.getByText('Decisão publicada pelo novo painel.',{exact:true}).waitFor();await overflow();
  // Se storage estiver bloqueado, o login e o descarte continuam funcionando.
  const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage indisponível');}});});
  const p2=await blocked.newPage();await p2.goto(url);await p2.getByLabel('Código de acesso',{exact:true}).fill('demo-gestao');await p2.getByRole('button',{name:'Entrar',exact:true}).click();await p2.getByRole('button',{name:'Agora não',exact:true}).click();await p2.getByRole('heading',{level:1,name:'Visão geral',exact:true}).waitFor();await blocked.close();
  assert.deepEqual(errors,[]);
  console.log('OK: visão geral e pendências reais; sidebar; menu móvel/foco; boas-vindas/tour 3 passos, Esc, storage e fallback; criação/encerramento/devolutiva/convites/fila; morador preservado; 375/1280 sem overflow.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();fs.rmSync(tmp,{recursive:true,force:true});});
