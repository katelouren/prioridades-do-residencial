const content = document.querySelector('#content');
const notice = document.querySelector('#notice');
const logout = document.querySelector('#logout');
const navigation = document.querySelector('#navigation');
let code = '';
let model = null;
let sessionGeneration = 0;

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}
function field(form, label, name, tag = 'input', attrs = {}) {
  const wrap = el('div', undefined, {class:'field'});
  const input = el(tag, undefined, {id:name, name, ...attrs});
  wrap.append(el('label', label, {for:name}), input);
  form.append(wrap);
  return input;
}
function panel(title, level = 2, className = '') {
  const box = el('section', undefined, {class:`card ${className}`.trim()});
  if (title) box.append(el(`h${level}`, title));
  return box;
}
function link(label, href, className = '') {
  const node = el('a', label, {href, class:className});
  if (className === 'back-link') node.prepend(el('span', '←', {'aria-hidden':'true'}));
  return node;
}
function message(text = '', error = false) {
  notice.setAttribute('role', error ? 'alert' : 'status');
  notice.setAttribute('aria-live', error ? 'assertive' : 'polite');
  notice.className = error ? 'error' : 'success';
  notice.textContent = text;
  if (error) notice.focus();
}
function focusPage() { document.querySelector('#main').focus(); }
async function api(path, data, access = code) {
  const generation = sessionGeneration;
  const options = {headers:{Authorization:`Bearer ${access}`}};
  if (data !== undefined) {
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }
  let response;
  try { response = await fetch(path, options); }
  catch { throw new Error('Não foi possível conectar ao portal. Confira se o servidor está aberto e tente novamente.'); }
  const payload = await response.json();
  if (generation !== sessionGeneration) throw new Error('A sessão foi encerrada. Entre novamente.');
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a ação. Tente novamente.');
  return payload;
}
function submit(form, label, action) {
  const button = el('button', label, {type:'submit', class:'primary'});
  form.append(button);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    const generation = sessionGeneration;
    message();
    try { await action(); }
    catch (error) { if (generation === sessionGeneration && form.isConnected) message(error.message, true); }
    finally { button.disabled = false; }
  });
  return button;
}
function route() { return location.hash.slice(1) || 'consultas'; }
async function refresh(text, to) {
  model = await api('/api/surveys');
  if (to) history.replaceState(null, '', `#${to}`);
  draw(); message(text); focusPage();
}
function heading(title, description, eyebrow = 'PORTAL DO MORADOR') {
  const box = el('div', undefined, {class:'page-heading'});
  box.append(el('p', eyebrow, {class:'eyebrow'}), el('h1', title));
  if (description) box.append(el('p', description, {class:'lead'}));
  return box;
}
function formatDate(value, fallback = 'A informar') {
  return value ? value.split('-').reverse().join('/') : fallback;
}
function facts(entries, className = '') {
  const list = el('dl', undefined, {class:`facts ${className}`.trim()});
  for (const [title, value] of entries) {
    const item = el('div'); item.append(el('dt', title), el('dd', value)); list.append(item);
  }
  return list;
}
function badge(text, kind = '') { return el('span', text, {class:`badge ${kind}`.trim()}); }
function consultationState(survey) {
  return survey.closed ? 'Encerrada' : survey.voted ? 'Participação registrada' : 'Aberta';
}
function trackingState(survey) {
  if (!survey.response) return 'Aguardando devolutiva';
  return ['Em análise','Em andamento','Concluído'].includes(survey.subject_status) ? survey.subject_status : 'Retorno publicado';
}
function login() {
  model = null;
  navigation.replaceChildren();
  logout.hidden = true;
  document.querySelector('#profile').hidden = true;
  document.querySelector('#residential-name').textContent = 'Participar e acompanhar';
  const layout = el('div', undefined, {class:'login-layout'});
  const intro = el('section', undefined, {class:'welcome'});
  intro.append(el('p', 'GS2 / CITIZENTECH', {class:'eyebrow'}), el('h1', 'Sua opinião conta. O retorno também.'),
    el('p', 'Participe das consultas do residencial e acompanhe o que a gestão decidiu fazer com as contribuições.'));
  const steps = el('ol', undefined, {class:'steps'});
  for (const [title, text] of [['Consulte','Conheça a proposta.'],['Participe','Registre sua preferência.'],['Acompanhe','Veja o resultado e o retorno.']]) {
    const item = el('li'); item.append(el('strong', title), el('span', text)); steps.append(item);
  }
  intro.append(steps);
  const box = panel('Acessar o portal', 2, 'login-card');
  box.append(el('p', 'Use seu código de morador ou de gestão. O perfil é identificado ao entrar.', {class:'quiet'}));
  const form = el('form');
  const entry = field(form, 'Código de acesso', 'access', 'input', {type:'password',required:'',autocomplete:'off',placeholder:'Digite seu código'});
  submit(form, 'Entrar', async () => {
    const candidate = entry.value.trim();
    const data = await api('/api/surveys', undefined, candidate);
    sessionGeneration += 1;
    code = candidate; model = data;
    draw(); focusPage();
  });
  box.append(form, el('p', 'Ambiente de demonstração com dados fictícios.', {class:'demo-note'}));
  layout.append(intro, box); content.replaceChildren(layout);
  document.title = 'Acessar · Prioridades do Residencial';
}
function summary(survey, admin, level = 2) {
  const box = panel(survey.title, level, 'survey-summary');
  const badges = el('div', undefined, {class:'badges'});
  badges.append(badge(consultationState(survey), survey.closed ? 'closed' : 'open'));
  if (survey.closed) badges.append(badge(trackingState(survey), 'muted'));
  // Mantém a descrição completa no detalhe e uma prévia curta na lista.
  const brief = survey.description.length > 155 ? survey.description.slice(0,survey.description.lastIndexOf(' ',152)).trimEnd() + '…' : survey.description;
  box.append(badges, el('p', brief, {class:'summary-context'}));
  if (!survey.closed) box.append(el('p', `Prazo de participação: ${formatDate(survey.deadline)}`, {class:'meta'}));
  else {
    const info = [];
    if (survey.responsible) info.push(['Área responsável', survey.responsible]);
    if (survey.next_update) info.push(['Próxima atualização', formatDate(survey.next_update)]);
    if (info.length) box.append(facts(info, 'summary-facts'));
  }
  let label = survey.closed ? 'Ver resultado e retorno' : survey.voted ? 'Acompanhar consulta' : 'Responder';
  if (admin) label = survey.closed ? (survey.response ? 'Atualizar devolutiva' : 'Publicar devolutiva') : 'Gerenciar consulta';
  box.append(link(label, `#consulta/${survey.id}`, 'primary'));
  return box;
}
function dashboard() {
  const container = el('div');
  container.append(heading(model.admin ? 'Painel da gestão' : 'Consultas do residencial',
    model.admin ? 'Publique uma proposta, acompanhe a participação e dê retorno às residências.' : 'Conheça as propostas, participe e acompanhe as decisões da gestão.',
    model.admin ? 'ÁREA DA GESTÃO' : 'PORTAL DO MORADOR'));
  if (model.admin) {
    const actions = el('div', undefined, {class:'task-actions'});
    actions.append(link('Criar consulta', '#gestao/nova', 'primary'), link('Gerenciar convites', '#gestao/convites', 'secondary'));
    container.append(actions);
  }
  const opened = model.surveys.filter(s => !s.closed);
  const closed = model.surveys.filter(s => s.closed);
  const stats = el('div', undefined, {class:'overview', 'aria-label':'Resumo das consultas'});
  for (const [amount, label] of [[opened.length,opened.length===1 ? 'consulta aberta' : 'consultas abertas'], [closed.filter(s=>!s.response).length,'aguardando devolutiva'], [closed.filter(s=>s.response).length,'com retorno publicado']]) {
    const item = el('p'); item.append(el('strong', String(amount)), el('span', label)); stats.append(item);
  }
  container.append(stats);
  const grid = el('div', undefined, {class:'survey-grid'});
  for (const survey of model.surveys) grid.append(summary(survey, model.admin));
  if (!model.surveys.length) grid.append(empty('As consultas vão aparecer aqui', model.admin ? 'Crie a primeira consulta para ouvir as residências.' : 'A gestão ainda não publicou consultas. Volte mais tarde para conferir.'));
  container.append(grid); return container;
}
function empty(title, text) { const box = panel(title, 2, 'empty'); box.append(el('p', text)); return box; }
function tracking() {
  const container = el('div');
  container.append(heading('Acompanhamento', 'Resultados e próximos passos das consultas encerradas.'));
  const closed = model.surveys.filter(s => s.closed);
  if (!closed.length) {
    container.append(empty('Nenhuma consulta encerrada', 'Os resultados e os encaminhamentos aparecerão aqui quando a gestão encerrar uma consulta.'));
    return container;
  }
  for (const [title, subtitle, items] of [
    ['Aguardando devolutiva','A consulta foi encerrada. O retorno da gestão ainda não foi publicado.',closed.filter(s=>!s.response)],
    ['Em acompanhamento','Retornos publicados e próximos passos da gestão.',closed.filter(s=>s.response && s.subject_status!=='Concluído')],
    ['Concluídas','Assuntos que a gestão marcou como concluídos.',closed.filter(s=>s.response && s.subject_status==='Concluído')]]) {
    const section = el('section', undefined, {class:'tracking-group'});
    section.append(el('h2',title), el('p',subtitle,{class:'quiet'}));
    if (!items.length) section.append(el('p','Nenhum assunto nesta etapa.',{class:'empty-inline'}));
    else {
      const grid=el('div',undefined,{class:'survey-grid'});
      for (const s of items) grid.append(summary(s,model.admin,3));
      section.append(grid);
    }
    container.append(section);
  }
  return container;
}
function result(survey) {
  const box = panel('Resultado');
  box.append(el('p', `${survey.count} participações registradas`, {class:'result-total'}));
  survey.questions.forEach((question, index) => {
    const group=el('section',undefined,{class:'result-group'});
    group.append(el('h3',question.label));
    const list=el('ul',undefined,{class:'result'});
    question.options.forEach((option,choice)=>{
      const li=el('li');const line=el('div',undefined,{class:'result-line'});
      line.append(el('span',option),el('strong',String(survey.totals[index][choice]),{class:'result-value'}));
      li.append(line,el('progress',undefined,{max:Math.max(1,survey.count),value:survey.totals[index][choice],'aria-hidden':'true'}));list.append(li);
    });
    group.append(list);box.append(group);
  });
  return box;
}
function followup(survey) {
  const box=panel(survey.response ? 'Retorno da gestão' : 'Aguardando devolutiva',2,'followup');
  if (survey.response) {
    box.append(badge(trackingState(survey),'closed'), el('h3','Decisão'),el('p',survey.response,{class:'decision'}),
      el('h3','Próximo passo'),el('p',survey.next_step || 'A informar'));
  } else box.append(el('p','A consulta foi encerrada e o resultado está disponível. A gestão ainda não publicou sua decisão e os próximos passos.'));
  box.append(facts([['Área responsável',survey.responsible || 'A informar'],['Próximo retorno',formatDate(survey.next_update)]]),
    el('p',`Previsão de conclusão: ${formatDate(survey.completion,'A definir')}`,{class:'completion'}));
  return box;
}
function responseForm(survey) {
  const box=panel(survey.response ? 'Atualizar a devolutiva' : 'Publicar a devolutiva');
  box.append(el('p','Informe o que foi decidido e quando os moradores receberão a próxima atualização.',{class:'quiet'}));
  const form=el('form');
  const decision=field(form,'Decisão da gestão',`response-${survey.id}`,'textarea',{required:'',maxlength:'1500',rows:'3'});decision.value=survey.response;
  const step=field(form,'Próximo passo (opcional)',`step-${survey.id}`,'textarea',{maxlength:'1500',rows:'2'});step.value=survey.next_step;
  const fields=el('div',undefined,{class:'form-grid'});
  const state=field(fields,'Status do encaminhamento',`status-${survey.id}`,'select');
  for (const value of ['Aguardando retorno','Em análise','Em andamento','Concluído']) state.append(el('option',value,{value}));
  state.value=survey.response ? survey.subject_status : 'Em análise';
  const responsible=field(fields,'Área responsável (sem dados pessoais)',`responsible-${survey.id}`,'input',{maxlength:'200'});responsible.value=survey.responsible;
  const next=field(fields,'Data do próximo retorno (opcional)',`next-${survey.id}`,'input',{type:'date'});next.value=survey.next_update;
  const completion=field(fields,'Previsão de conclusão (opcional)',`completion-${survey.id}`,'input',{type:'date'});completion.value=survey.completion;
  form.append(fields,el('p','Próximo retorno é a data da próxima atualização. Conclusão é a previsão de finalizar o assunto; pode ficar a definir.',{class:'hint'}));
  submit(form,survey.response ? 'Atualizar devolutiva' : 'Publicar devolutiva',async()=>{
    await api(`/api/surveys/${survey.id}/response`,{response:decision.value,next_step:step.value,subject_status:state.value,responsible:responsible.value,next_update:next.value,completion:completion.value});
    await refresh('Devolutiva publicada e disponível para os moradores.');
  });
  box.append(form);return box;
}
function closeControl(survey) {
  const box=panel('Encerrar a participação',2,'management-control');
  box.append(el('p','Enquanto estiver aberta, a consulta recebe respostas e a contagem permanece oculta.'));
  const button=el('button','Encerrar consulta',{type:'button',class:'secondary'});
  const confirmation=el('div',undefined,{class:'confirmation',hidden:''});
  const title=el('h3','Encerrar esta consulta?',{tabindex:'-1'});
  confirmation.append(title,el('p','O encerramento interrompe novas respostas e libera a contagem para os moradores. Esta ação não pode ser desfeita pelo painel.'));
  const form=el('form');
  submit(form,'Confirmar encerramento',async()=>{
    await api(`/api/surveys/${survey.id}/close`,{});
    await refresh('Consulta encerrada. A contagem está disponível; publique a devolutiva para os moradores.');
  });
  const cancel=el('button','Cancelar',{type:'button',class:'text-button'});
  cancel.addEventListener('click',()=>{confirmation.hidden=true;button.hidden=false;button.focus();});
  form.append(cancel);confirmation.append(form);
  button.addEventListener('click',()=>{button.hidden=true;confirmation.hidden=false;title.focus();});
  box.append(button,confirmation);return box;
}
function voting(survey) {
  const box=panel('Registre sua preferência');
  box.append(el('p','Escolha uma opção por pergunta. Uma participação por residência, mesmo que o código de acesso seja substituído.',{class:'quiet'}));
  const form=el('form');
  survey.questions.forEach((question,index)=>{
    const group=el('fieldset',undefined,{class:'question'});
    group.append(el('legend',`${index+1}. ${question.label}`));
    question.options.forEach((option,choice)=>{
      const label=el('label',undefined,{class:'choice'});
      label.append(el('input',undefined,{type:'radio',name:`choice-${index}`,value:choice,required:''}),el('span',option));group.append(label);
    });
    form.append(group);
  });
  submit(form,'Confirmar participação',async()=>{
    const data=new FormData(form);
    const choices=survey.questions.map((_,i)=>Number(data.get(`choice-${i}`)));
    await api(`/api/surveys/${survey.id}/vote`,{choices});
    await refresh('Participação registrada. Você poderá acompanhar o resultado após o encerramento.');
  });
  box.append(form);return box;
}
function detail(survey) {
  const container=el('div',undefined,{class:'detail'});
  container.append(link('Voltar às consultas','#consultas','back-link'));
  container.append(heading(survey.title,'',model.admin ? 'GESTÃO DA CONSULTA' : 'CONSULTA ÀS RESIDÊNCIAS'));
  const states=el('div',undefined,{class:'badges detail-badges'});states.append(badge(consultationState(survey),survey.closed?'closed':'open'));
  container.append(states);
  const context=panel('Sobre esta consulta');
  context.append(el('p',survey.description),el('p','Consulta para orientar a decisão da gestão.',{class:'consultative'}),
    facts([['Prazo de participação',formatDate(survey.deadline)],['Custo aproximado',survey.cost || 'A informar']],'context-facts'),
    el('p',`Impactos na rotina: ${survey.impacts || 'A informar'}`,{class:'impacts'}));
  container.append(context);
  if (survey.closed) {
    container.append(followup(survey),result(survey));
    if(model.admin)container.append(responseForm(survey));
  } else if(model.admin)container.append(closeControl(survey));
  else if(survey.voted) {
    const confirmed=panel('Participação registrada',2,'participation-confirmed');
    confirmed.querySelector('h2').prepend(el('span','✓',{'aria-hidden':'true',class:'confirmation-icon'}));
    confirmed.append(el('p','Sua residência já respondeu a esta consulta. A participação está salva.'),el('h3','O que acontece agora?'),el('p','A consulta continua aberta. Após o encerramento, você poderá ver a contagem e acompanhar o retorno da gestão.'),link('Voltar às consultas','#consultas','primary'));
    container.append(confirmed);
  } else container.append(voting(survey));
  return container;
}
function createSurvey() {
  const container=el('div',undefined,{class:'detail'});
  container.append(link('Voltar às consultas','#consultas','back-link'),heading('Criar consulta','Apresente a proposta e as informações necessárias para as residências participarem.','ÁREA DA GESTÃO'));
  const box=panel('Contexto e participação');const form=el('form');
  const title=field(form,'Título da consulta','title','input',{required:'',maxlength:'120'});
  const description=field(form,'Contexto da consulta','description','textarea',{required:'',maxlength:'1500',rows:'3'});
  const fields=el('div',undefined,{class:'form-grid'});
  const deadline=field(fields,'Prazo de participação (opcional; até o fim do dia)','deadline','input',{type:'date'});
  const cost=field(fields,'Custo aproximado (opcional)','cost','input',{maxlength:'200'});
  form.append(fields);
  const impacts=field(form,'Impactos na rotina (opcional)','impacts','textarea',{maxlength:'1500',rows:'2'});
  form.append(el('h3','Perguntas'),el('p','Uma opção por pergunta. Inclua de duas a seis opções, uma por linha. Você pode publicar até seis perguntas.',{class:'hint'}));
  const inputs=[];
  for(let i=1;i<=6;i++){
    const holder=i===1 ? el('div',undefined,{class:'question-editor'}) : el('details',undefined,{class:'question-editor'});
    if(i>1)holder.append(el('summary',`Adicionar pergunta ${i} (opcional)`));
    inputs.push({label:field(holder,`Pergunta ${i}`,`q-${i}`,'input',{maxlength:'200',...(i===1 ? {required:''}:{})}),options:field(holder,`Opções da pergunta ${i} (uma por linha)`,`options-${i}`,'textarea',{rows:'3',...(i===1 ? {required:''}:{})})});
    form.append(holder);
  }
  submit(form,'Publicar consulta',async()=>{
    const questions=inputs.filter(q=>q.label.value.trim() || q.options.value.trim()).map(q=>({label:q.label.value,options:q.options.value.split('\n').map(v=>v.trim()).filter(Boolean)}));
    const result=await api('/api/surveys',{title:title.value,description:description.value,deadline:deadline.value,cost:cost.value,impacts:impacts.value,questions});
    await refresh('Consulta publicada. As residências já podem responder.',`consulta/${result.id}`);
  });
  box.append(form);container.append(box);return container;
}
function invites() {
  const container=el('div',undefined,{class:'detail'});
  container.append(link('Voltar às consultas','#consultas','back-link'),heading('Gerenciar convites','Um código ativo por residência. Cadastre ou substitua o acesso pelo mesmo identificador.','ÁREA DA GESTÃO'));
  const box=panel('Gerar ou substituir um código');
  const form=el('form');
  const residence=field(form,'Identificador da residência (fictício, ex.: DEMO-03)','residence','input',{required:'',maxlength:'80',placeholder:'Ex.: DEMO-03'});
  form.append(el('p','Ao usar um identificador já cadastrado, o código anterior perde o acesso. As participações da residência são preservadas.',{class:'hint'}));
  const output=el('output','',{'aria-live':'polite',class:'invite-output'});
  submit(form,'Gerar código de morador',async()=>{
    const generated=await api('/api/invites',{residence:residence.value});
    output.textContent=`Código gerado para ${residence.value.trim()}: ${generated.code}. O código anterior perdeu o acesso. Copie e guarde este código; ele só aparece agora.`;
    // Atualiza a lista sem remover o código recém-gerado da tela.
    model=await api('/api/surveys');
    residenceList.replaceChildren(...model.residences.map(r=>el('li',r.identifier)));
    message('Código gerado. As participações anteriores foram preservadas.');
  });
  form.append(output);box.append(form);
  const registered=panel('Residências cadastradas');const residenceList=el('ul',undefined,{class:'residence-list'});
  for(const r of model.residences)residenceList.append(el('li',r.identifier));
  registered.append(residenceList);
  if(!model.residences.length)registered.append(el('p','Nenhuma residência cadastrada. Gere o primeiro código para começar.'));
  container.append(box,registered);return container;
}
function resources() {
  const container=el('div');container.append(heading('Regras e contatos','Encontre o canal adequado e consulte os documentos do residencial.'));
  const channels=panel('Canais por assunto');channels.append(el('p','Contatos do residencial fictício. Nenhum dado pessoal é publicado.',{class:'quiet'}));
  const grid=el('div',undefined,{class:'channel-grid'});
  for(const [subject,owner] of [['Limpeza e manutenção','Administração'],['Eventos e atividades','Associação'],['Acompanhamento e prestação de contas','Conselho']]){
    const item=el('section',undefined,{class:'channel'});item.append(el('h3',subject),el('p',owner),el('p','Contato: A informar',{class:'quiet'}));grid.append(item);
  }
  channels.append(grid);
  const documents=panel('Documentos do residencial');
  for(const title of ['Convenção do residencial','Regimento interno','Calendário e regras de eventos']){
    const row=el('section',undefined,{class:'document-row'});row.append(el('h3',title),badge('Aguardando publicação','muted'),el('p','Fonte/link: Aguardando publicação · Data da versão: A informar',{class:'hint'}));documents.append(row);
  }
  const references=panel('Legislação e orientações gerais');
  references.append(el('p','Referências oficiais para consulta. Considere também os documentos e decisões aplicáveis ao residencial.',{class:'quiet'}));
  for(const [title,url,version] of [
    ['Código Civil — Lei nº 10.406/2002 (condomínio edilício)','https://www2.camara.leg.br/legin/fed/lei/2002/lei-10406-10-janeiro-2002-432893-normaatualizada-pl.html','10/01/2002; texto atualizado'],
    ['LGPD — Lei nº 13.709/2018','https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html','14/08/2018; texto atualizado']]){
    const row=el('div',undefined,{class:'document-row'});row.append(el('a',title,{href:url,target:'_blank',rel:'noopener noreferrer'}),el('p',`Fonte: Câmara dos Deputados · Versão: ${version}. Referência conferida em 10/11/2026.`,{class:'hint'}));references.append(row);
  }
  container.append(channels,documents,references);return container;
}
function draw() {
  if(!model)return;
  logout.hidden=false;
  document.querySelector('#residential-name').textContent=model.name;
  const profile=document.querySelector('#profile');profile.hidden=false;profile.textContent=model.admin?'Gestão':'Morador';
  const current=route();
  const nav=el('nav',undefined,{'aria-label':'Navegação do portal',class:'portal-nav'});
  for(const [label,to] of [['Consultas','consultas'],['Acompanhamento','acompanhamento'],['Regras e contatos','regras']]){
    const a=link(label,`#${to}`);
    if(current===to || (to==='consultas' && (current.startsWith('consulta/') || current.startsWith('gestao/'))))a.setAttribute('aria-current','page');
    nav.append(a);
  }
  navigation.replaceChildren(nav);
  let page;
  const match=current.match(/^consulta\/([0-9]{1,12})$/);
  if(match){
    const survey=model.surveys.find(s=>s.id===Number(match[1]));
    page=survey ? detail(survey) : heading('Consulta não encontrada','A consulta não está disponível. Use a navegação para voltar à lista.');
  } else if(current==='acompanhamento')page=tracking();
  else if(current==='regras')page=resources();
  else if(current==='gestao/nova' || current==='gestao/convites'){
    page=model.admin ? (current==='gestao/nova' ? createSurvey() : invites()) : heading('Área exclusiva da gestão','Use Consultas para participar e Acompanhamento para conferir os retornos.');
  } else {
    if(current!=='consultas')history.replaceState(null,'','#consultas');
    page=dashboard();
  }
  content.replaceChildren(page);
  document.title=`${content.querySelector('h1').textContent} · Prioridades do Residencial`;
}
document.querySelector('.skip').addEventListener('click', event => { event.preventDefault(); focusPage(); });
window.addEventListener('hashchange',()=>{if(model){message();draw();focusPage();}});
logout.addEventListener('click',()=>{
  sessionGeneration += 1;
  code='';model=null;message();history.replaceState(null,'','#consultas');login();document.querySelector('#access').focus();
});
login();
