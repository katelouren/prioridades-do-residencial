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
  browser=await chromium.launch({headless:true, ...(process.env.PR_BROWSER ? {executablePath:process.env.PR_BROWSER}: {})});
  const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage();page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const screenshot=async name=>{
    fs.mkdirSync(path.join(__dirname,'../docs/screenshots'),{recursive:true});
    await page.screenshot({path:path.join(__dirname,`../docs/screenshots/${name}.png`),fullPage:true});
  };
  const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sem rolagem horizontal');
  const status=async text=>{await page.locator('#notice').filter({hasText:text}).waitFor();};
  const login=async code=>{
    await page.getByLabel('Código de acesso',{exact:true}).fill(code);
    await page.keyboard.press('Tab');await page.keyboard.press('Enter');
    await page.waitForFunction(()=>Boolean(document.querySelector('#navigation nav')));
    if(await page.getByRole('button',{name:'Agora não',exact:true}).isVisible())await page.getByRole('button',{name:'Agora não',exact:true}).click();await overflow();
  };
  const logout=async()=>{if(!await page.getByRole('button',{name:'Sair',exact:true}).isVisible())await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Sair',exact:true}).click();};
  const nav=async name=>{if(await page.getByRole('button',{name:'Menu',exact:true}).isVisible() && await page.getByRole('button',{name:'Menu',exact:true}).getAttribute('aria-expanded')==='false')await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('navigation').getByRole('link',{name,exact:true}).click();await page.getByRole('heading',{level:1,name:name==='Consultas' ? /^(Consultas do residencial|Consultas)$/ : name,exact:true}).waitFor();};
  const open=async title=>{
    const card=page.locator('.survey-summary').filter({has:page.getByRole('heading',{name:title,exact:true})});
    if(!await card.count())await nav('Consultas');
    await card.locator('a.primary').click();await page.getByRole('heading',{level:1,name:title,exact:true}).waitFor();await overflow();
  };
  const back=async()=>{await page.getByRole('link',{name:'Voltar às consultas',exact:true}).first().click();await page.getByRole('heading',{level:1,name:/^(Consultas do residencial|Consultas)$/}).waitFor();};
  await page.goto(url);await screenshot('login-mobile');await login('demo-morador-1');
  await page.getByRole('heading',{level:1,name:'Consultas do residencial',exact:true}).waitFor();
  assert.equal(await page.locator('fieldset').count(),0,'Lista não apresenta formulários de votação');
  assert.equal(await page.locator('.survey-summary').count(),3);
  const opened=page.locator('.survey-summary').filter({hasText:'Formato e decoração de um evento'});
  assert.equal(await opened.getByText('Aguardando retorno',{exact:true}).count(),0,'Aberta não usa status de encaminhamento');
  await screenshot('mobile');
  await page.setViewportSize({width:1280,height:900});await overflow();await screenshot('desktop');
  await page.setViewportSize({width:375,height:812});
  await nav('Acompanhamento');
  assert.equal(await page.locator('.survey-summary').count(),2,'Só encerradas no acompanhamento');
  assert.equal(await page.getByRole('heading',{name:'Formato e decoração de um evento',exact:true}).count(),0);
  await overflow();await screenshot('acompanhamento-mobile');
  await nav('Regras e contatos');
  const headings=await page.locator('main h2').allTextContents();
  assert.ok(headings.indexOf('Canais por assunto')<headings.indexOf('Documentos do residencial'));
  assert.ok(headings.indexOf('Documentos do residencial')<headings.indexOf('Legislação e orientações gerais'));
  assert.equal(await page.locator('main a[href^="https://www2.camara.leg.br/"]').count(),2);
  await overflow();await nav('Consultas');await open('Formato e decoração de um evento');
  const demoHash=new URL(page.url()).hash;
  await page.locator('.skip').focus();await page.keyboard.press('Enter');
  await page.waitForURL(value=>value.hash===demoHash,{timeout:1500});
  assert.equal(await page.evaluate(()=>document.activeElement.id),'main');
  assert.equal(await page.getByRole('group').count(),3);
  assert.ok(await page.getByRole('radio',{name:'Não se aplica',exact:true}).isVisible());
  assert.equal(await page.getByText('Aguardando retorno',{exact:true}).count(),0);
  await screenshot('consulta-mobile');await back();await page.goBack();
  await page.getByRole('heading',{level:1,name:'Formato e decoração de um evento',exact:true}).waitFor();
  await page.reload();await page.getByLabel('Código de acesso',{exact:true}).waitFor();await login('demo-morador-1');
  assert.equal(new URL(page.url()).hash,demoHash,'Reautenticação retoma detalhe');
  await logout();await login('demo-gestao');
  await page.getByRole('link',{name:'Criar consulta',exact:true}).click();
  await page.getByLabel('Título da consulta',{exact:true}).fill('Consulta do fluxo completo');
  await page.getByLabel('Contexto da consulta',{exact:true}).fill('Consulta fictícia para orientar a decisão sobre o salão.');
  await page.getByLabel('Prazo de participação',{exact:false}).fill('2099-12-31');
  await page.getByLabel('Custo aproximado (opcional)').fill('R$ 500 demonstrativos');
  await page.getByLabel('Impactos na rotina (opcional)').fill('Uso do salão por duas horas.');
  await page.locator('#q-1').fill('Qual formato você prefere?');
  await page.locator('#options-1').fill('Formato A\nFormato B\nSem preferência');
  await page.getByRole('button',{name:'Publicar consulta',exact:true}).click();await status('Consulta publicada');
  assert.equal(await page.getByRole('heading',{level:1}).textContent(),'Consulta do fluxo completo');
  const createdHash=new URL(page.url()).hash;
  assert.ok(await page.getByText('R$ 500 demonstrativos',{exact:true}).isVisible());
  assert.ok(await page.getByText('Impactos na rotina: Uso do salão por duas horas.',{exact:true}).isVisible());
  await logout();await login('demo-morador-1');await open('Consulta do fluxo completo');
  assert.equal(await page.getByRole('heading',{name:'Resultado',exact:true}).count(),0);
  // Vota somente por teclado; a linha inteira também é um label clicável.
  let found=false;
  for(let k=0;k<30;k++){
    await page.keyboard.press('Tab');
    if(await page.evaluate(()=>document.activeElement?.type==='radio')){found=true;break;}
  }
  assert.ok(found,'Opções acessíveis por teclado');await page.keyboard.press('Space');await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Confirmar participação');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid');
  await page.keyboard.press('Enter');await status('Participação registrada');
  assert.equal(await page.getByRole('button',{name:'Confirmar participação'}).count(),0);
  assert.ok(await page.getByRole('heading',{name:'Participação registrada',exact:true}).isVisible());
  await back();
  assert.ok(await page.locator('.survey-summary').filter({hasText:'Consulta do fluxo completo'}).getByRole('link',{name:'Acompanhar consulta',exact:true}).isVisible());
  await logout();await login('demo-morador-2');await open('Consulta do fluxo completo');
  await page.getByRole('radio',{name:'Formato B',exact:true}).check();
  await page.getByRole('button',{name:'Confirmar participação'}).click();await status('Participação registrada');
  await logout();await login('demo-gestao');await page.getByRole('link',{name:'Gerenciar convites',exact:true}).click();
  await page.getByLabel('Identificador da residência',{exact:false}).fill('DEMO-01');
  await page.getByRole('button',{name:'Gerar código de morador',exact:true}).click();
  const output=page.locator('output');await output.filter({hasText:'Código gerado'}).waitFor();
  const replacement=(await output.textContent()).match(/DEMO-01: ([^. ]+)/)[1];await overflow();
  await logout();await page.getByLabel('Código de acesso',{exact:true}).fill('demo-morador-1');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();await status('Use um código de acesso válido.');
  assert.equal(await page.locator('#notice').getAttribute('role'),'alert');
  await login(replacement);await open('Consulta do fluxo completo');
  assert.equal(await page.getByRole('button',{name:'Confirmar participação'}).count(),0);
  // Outro contexto/navegador mantém a regra da residência.
  const second=await browser.newContext();const p2=await second.newPage();await p2.goto(url);
  await p2.getByLabel('Código de acesso',{exact:true}).fill(replacement);await p2.getByRole('button',{name:'Entrar',exact:true}).click();
  await p2.locator('.survey-summary').filter({hasText:'Consulta do fluxo completo'}).getByRole('link',{name:'Acompanhar consulta',exact:true}).waitFor();await second.close();
  await logout();await login('demo-gestao');await open('Consulta do fluxo completo');
  await page.getByRole('button',{name:'Encerrar consulta',exact:true}).click();
  await page.getByRole('heading',{name:'Encerrar esta consulta?',exact:true}).waitFor();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Confirmar encerramento'}).count(),0);
  await page.getByRole('button',{name:'Encerrar consulta',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar encerramento',exact:true}).click();await status('Consulta encerrada');
  await page.getByRole('heading',{name:'Resultado',exact:true}).waitFor();
  assert.ok(await page.getByText('2 participações registradas',{exact:true}).isVisible());
  assert.equal(await page.locator('.result-value').allTextContents().then(x=>x.join(',')),'1,1,0');
  await page.getByLabel('Decisão da gestão',{exact:true}).fill('Realizar um encontro no salão.');
  await page.getByLabel('Próximo passo (opcional)',{exact:true}).fill('Solicitar propostas à associação.');
  await page.getByLabel('Status do encaminhamento',{exact:true}).selectOption('Em andamento');
  await page.getByLabel('Área responsável (sem dados pessoais)').fill('Associação');
  await page.getByLabel('Data do próximo retorno',{exact:false}).fill('2027-01-15');
  await page.getByLabel('Previsão de conclusão',{exact:false}).fill('2027-03-01');
  await page.getByRole('button',{name:'Publicar devolutiva',exact:true}).click();await status('disponível para os moradores');
  await page.getByLabel('Previsão de conclusão',{exact:false}).fill('');
  await page.getByRole('button',{name:'Atualizar devolutiva',exact:true}).click();await status('disponível para os moradores');
  await overflow();await screenshot('gestao-mobile');
  await stop();url=await start();await page.goto(url+createdHash);await login(replacement);
  assert.ok(await page.getByText('Realizar um encontro no salão.',{exact:true}).isVisible());
  assert.ok(await page.getByText('Solicitar propostas à associação.',{exact:true}).isVisible());
  assert.ok(await page.getByText('15/01/2027',{exact:true}).isVisible());
  assert.ok(await page.getByText('Previsão de conclusão: A definir',{exact:true}).isVisible());
  await overflow();await screenshot('resultado-mobile');
  await page.setViewportSize({width:1280,height:900});await overflow();await screenshot('resultado-desktop');
  await nav('Acompanhamento');await page.getByRole('heading',{level:1,name:'Acompanhamento',exact:true}).waitFor();
  const tracking=page.locator('.survey-summary').filter({hasText:'Consulta do fluxo completo'});
  assert.ok(await tracking.getByText('Associação',{exact:true}).isVisible());
  assert.ok(await tracking.getByText('15/01/2027',{exact:false}).isVisible());
  await page.goto(url+'#consulta/999999');await page.getByRole('heading',{name:'Consulta não encontrada',exact:true}).waitFor();
  await nav('Consultas');await overflow();
  // Uma resposta HTTP tardia não pode reabrir o perfil depois de Sair.
  await logout();await login('demo-gestao');await open('Consulta do fluxo completo');
  let releaseRead, markRead;
  const readStarted=new Promise(resolve=>{markRead=resolve;});
  const readGate=new Promise(resolve=>{releaseRead=resolve;});
  await page.route('**/api/surveys',async route=>{
    if(route.request().method()!=='GET'){await route.continue();return;}
    const response=await route.fetch();markRead();await readGate;await route.fulfill({response});
  });
  await page.getByRole('button',{name:'Atualizar devolutiva',exact:true}).click();
  await readStarted;await logout();releaseRead();
  await page.waitForLoadState('networkidle');
  assert.ok(await page.getByLabel('Código de acesso',{exact:true}).isVisible(),'Sair não é revertido por resposta tardia');
  assert.equal(await page.getByRole('navigation').count(),0);
  await page.unroute('**/api/surveys');
  assert.deepEqual(errors,[]);
  console.log('OK: cartões sem formulários; detalhe e histórico; retomada após login; acompanhamento só de encerradas; regras em tela própria; publicação → duas respostas → encerramento → devolutiva → morador; rotação/outro navegador; reinício; teclado/foco; 375 e 1280 px sem overflow ou erros JS.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();fs.rmSync(tmp,{recursive:true,force:true});});
