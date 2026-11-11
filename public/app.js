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
function focusPage() {
  document.querySelector('#main').focus();
  if(model?.admin)window.scrollTo(0,0);
}
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
async function loadModel(access = code) {
  const data = await api('/api/surveys', undefined, access);
  const services = await api(data.admin ? '/api/cleaning' : '/api/requests', undefined, access);
  return {...data, requests: data.admin ? services.orders : services.requests};
}
async function refresh(text, to) {
  model = await loadModel();
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
  resetAdminShell();
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
    const data = await loadModel(candidate);
    sessionGeneration += 1;
    code = candidate; model = data;
    if (data.admin && !location.hash) history.replaceState(null, '', '#visao-geral');
    draw(); focusPage();
    if (data.admin && !introDismissed()) showAdminIntro();
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
  container.append(heading(model.admin ? 'Consultas' : 'Consultas do residencial',
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
function tracking(title = 'Acompanhamento') {
  const container = el('div');
  container.append(heading(title, 'Resultados e próximos passos das consultas encerradas.'));
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
    model=await loadModel();
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
function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'}) : 'A informar';
}
function serviceCard(item, admin = false) {
  const box = panel(`Protocolo ${item.protocol}`, 2, admin ? 'order-card' : 'request-card');
  box.setAttribute('data-protocol', item.protocol);
  box.append(badge(item.status, item.status === 'Concluída' ? 'closed' : 'open'),
    el('p', `${item.local} · ${item.category}`, {class:'service-context'}),
    el('p', item.description, {class:'service-description'}),
    facts([['Aberta em', formatDateTime(item.created_at)], ['Equipe responsável', item.team]]));
  if (item.status === 'Concluída') {
    const feedback = el('div', undefined, {class:'service-feedback'});
    feedback.append(el('h3', 'Devolutiva'), el('p', item.feedback), el('p', `Concluída em ${formatDateTime(item.completed_at)}`, {class:'hint'}));
    box.append(feedback);
  } else if (!admin) box.append(el('p', 'A ordem de limpeza foi criada automaticamente e aguarda execução.', {class:'hint'}));
  if (admin) box.append(link(item.status === 'Pendente' ? 'Abrir tarefa' : 'Ver conclusão', `#limpeza/${item.protocol}`, 'primary'));
  return box;
}
function requestsPage() {
  const container = el('div');
  container.append(heading('Minhas solicitações', 'Solicite a higiene da academia e acompanhe o atendimento pelo protocolo.'));
  const refreshForm = el('form', undefined, {class:'service-refresh'});
  submit(refreshForm, 'Atualizar solicitações', async () => { await refresh('Solicitações atualizadas.'); });
  container.append(refreshForm);
  const layout = el('div', undefined, {class:'service-layout'});
  const box = panel('Solicitar higiene da academia');
  box.append(el('p', 'Uma ordem será encaminhada automaticamente à equipe de limpeza. Use apenas dados fictícios nesta demonstração.', {class:'quiet'}));
  const form = el('form');
  const fixed = el('div', undefined, {class:'form-grid'});
  field(fixed, 'Local', 'service-local', 'input', {value:'Academia', readonly:''});
  field(fixed, 'Categoria', 'service-category', 'input', {value:'Higiene', readonly:''});
  form.append(fixed);
  const description = field(form, 'Descrição da solicitação', 'service-description', 'textarea', {required:'',maxlength:'1500',rows:'4',placeholder:'Ex.: Os aparelhos da academia estão sujos'});
  form.append(el('p', 'Descreva o que precisa ser limpo, sem incluir dados pessoais. Limite de 1500 caracteres.', {class:'hint'}));
  submit(form, 'Enviar solicitação', async () => {
    // O POST é o gatilho; a criação da OS acontece exclusivamente no servidor.
    const result = await api('/api/requests', {local:'Academia',category:'Higiene',description:description.value});
    await refresh(`Solicitação ${result.request.protocol} registrada. Ordem de limpeza criada automaticamente.`, 'solicitacoes');
  });
  box.append(form);
  const list = el('section', undefined, {'aria-label':'Solicitações da minha residência',class:'service-list'});
  list.append(el('h2', 'Histórico da residência'));
  if (!model.requests.length) list.append(el('p', 'Você ainda não tem solicitações.', {class:'empty-inline'}));
  for (const item of model.requests) list.append(serviceCard(item));
  layout.append(box,list);container.append(layout);return container;
}
function cleaningQueue() {
  const container = el('div');
  container.append(heading('Fila de limpeza', 'Ordens criadas automaticamente pelas solicitações de higiene da academia.', 'ÁREA DA GESTÃO'));
  const form = el('form', undefined, {class:'service-refresh'});
  submit(form, 'Atualizar fila', async () => { await refresh('Fila de limpeza atualizada.'); });
  container.append(form);
  for (const [title, status] of [['Pendentes','Pendente'],['Concluídas','Concluída']]) {
    const group = el('section', undefined, {class:'tracking-group'});
    group.append(el('h2', title));
    const items = model.requests.filter(item => item.status === status);
    if (!items.length) group.append(el('p', status === 'Pendente' ? 'Nenhuma ordem de limpeza pendente.' : 'Nenhuma ordem concluída.', {class:'empty-inline'}));
    const grid = el('div', undefined, {class:'survey-grid'});
    for (const item of items) grid.append(serviceCard(item,true));
    group.append(grid);container.append(group);
  }
  return container;
}
function cleaningDetail(item) {
  const container = el('div', undefined, {class:'detail'});
  container.append(link('Voltar à fila de limpeza','#limpeza','back-link'), heading(`Ordem ${item.protocol}`, 'Higiene da academia · atendimento da equipe de limpeza', 'ÁREA DA GESTÃO'));
  container.append(serviceCard(item));
  if (item.status === 'Pendente') {
    const box = panel('Concluir a ordem de serviço');
    box.append(el('p', 'Ao confirmar, o status e a devolutiva serão salvos juntos e ficarão disponíveis para a residência no mesmo protocolo.', {class:'quiet'}));
    const form = el('form');
    const feedback = field(form, 'O que foi feito?', 'cleaning-feedback', 'textarea', {required:'',maxlength:'1500',rows:'4',placeholder:'Ex.: Aparelhos higienizados'});
    submit(form, 'Confirmar conclusão', async () => {
      await api(`/api/cleaning/${item.protocol}/complete`, {feedback:feedback.value});
      await refresh('Conclusão e devolutiva salvas. A residência já pode acompanhar o retorno no mesmo protocolo.');
    });
    box.append(form);container.append(box);
  }
  return container;
}
// Interface administrativa: não muda a autenticação nem os registros no servidor.
let adminMenuOpen = false;
let introState = null;
const INTRO_KEY = 'pr-gestao-introducao';
const adminDialog = document.querySelector('#admin-intro');
const adminMenu = document.querySelector('#admin-menu');
function adminMobile() { return matchMedia('(max-width: 760px)').matches; }
function adminIcon(name) {
  const paths = {
    home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
    surveys:'M5 3h14v18H5ZM8 8h8M8 12h8M8 16h5',
    response:'M4 4h16v12H9l-5 4ZM8 8h8M8 12h5',
    invites:'M3 5h18v14H3Zm0 0 9 7 9-7',
    cleaning:'m7 3 10 18M4 17l9-5 7 7-5 3Z',
    help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20'
  };
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[name] || paths.home);svg.append(path);return svg;
}
function setAdminMenu(open, focus = false) {
  adminMenuOpen = Boolean(open && model?.admin && adminMobile());
  document.body.classList.toggle('admin-menu-open',adminMenuOpen);
  adminMenu.setAttribute('aria-expanded',String(adminMenuOpen));
  document.querySelector('#admin-backdrop').hidden=!adminMenuOpen;
  document.querySelector('#main').inert=adminMenuOpen;
  if(focus) {
    if(adminMenuOpen)navigation.querySelector('a')?.focus();
    else adminMenu.focus();
  }
}
function resetAdminShell() {
  if(introState) dismissAdminIntro(false);
  document.body.classList.remove('admin','admin-menu-open','admin-touring');
  document.querySelector('#admin-header').hidden=true;
  document.querySelector('#admin-backdrop').hidden=true;
  document.querySelector('#main').inert=false;
  navigation.className='';navigation.removeAttribute('aria-label');
  document.querySelector('.account').append(logout);
  logout.className='header-button';
  adminMenuOpen=false;adminMenu.setAttribute('aria-expanded','false');
}
function adminSection(current) {
  if(current==='gestao/convites')return 'convites';
  if(current==='devolutivas' || current==='acompanhamento')return 'devolutivas';
  if(current.startsWith('limpeza'))return 'limpeza';
  if(current.startsWith('consulta/')) {
    const survey=model.surveys.find(s=>`consulta/${s.id}`===current);
    return survey?.closed ? 'devolutivas' : 'consultas';
  }
  return current==='consultas' || current==='gestao/nova' ? 'consultas' : 'visao-geral';
}
function renderAdminShell(current) {
  document.body.classList.add('admin');navigation.className='admin-sidebar';navigation.setAttribute('aria-label','Painel da gestão');
  document.querySelector('#admin-header').hidden=false;
  const active=adminSection(current);
  const labels={'visao-geral':'Visão geral',consultas:'Consultas',devolutivas:'Devolutivas',convites:'Convites',limpeza:'Fila de limpeza'};
  document.querySelector('#admin-section-name').textContent=labels[active];
  const brand=el('div',undefined,{class:'sidebar-brand'});
  const name=el('div');name.append(el('strong','Prioridades do Residencial'),el('small',model.name));
  brand.append(el('span','PR',{class:'brand-mark','aria-hidden':'true'}),name);
  const nav=el('nav',undefined,{'aria-label':'Navegação do portal',class:'admin-nav'});
  for(const [label,section,to,icon] of [
    ['Visão geral','visao-geral','visao-geral','home'],['Consultas','consultas','consultas','surveys'],
    ['Devolutivas','devolutivas','devolutivas','response'],['Convites','convites','gestao/convites','invites'],
    ['Fila de limpeza','limpeza','limpeza','cleaning']]) {
    const item=link('',`#${to}`);item.append(adminIcon(icon),el('span',label));item.setAttribute('data-admin-section',section);
    if(section===active)item.setAttribute('aria-current','page');
    item.addEventListener('click',()=>{setAdminMenu(false);if(route()===to)focusPage();});nav.append(item);
  }
  const foot=el('div',undefined,{class:'sidebar-footer'});
  const help=el('button',undefined,{type:'button',id:'admin-help',class:'sidebar-help'});
  help.append(adminIcon('help'),el('span','Como usar o painel'));
  help.addEventListener('click',()=>showAdminIntro(help));
  logout.className='sidebar-logout';
  foot.append(help,logout,el('small','Ambiente de demonstração'));
  navigation.replaceChildren(brand,el('p','GESTÃO DO RESIDENCIAL',{class:'sidebar-caption'}),nav,foot);
  setAdminMenu(adminMenuOpen);
}
function adminOverview() {
  const container=el('div',undefined,{class:'admin-overview'});
  container.append(heading('Visão geral','Veja o que precisa da sua atenção e acompanhe o retorno aos moradores.','GESTÃO DO RESIDENCIAL'));
  const actions=el('div',undefined,{class:'admin-actions'});
  const create=link('Criar consulta','#gestao/nova','primary');create.id='admin-create-shortcut';
  actions.append(create,link('Gerenciar convites','#gestao/convites','secondary'));
  const update=el('form');submit(update,'Atualizar painel',async()=>{await refresh('Painel atualizado.');});actions.append(update);container.append(actions);
  const metrics=el('div',undefined,{class:'admin-metrics','aria-label':'Indicadores das consultas'});
  for(const [label,value,description] of [
    ['Consultas abertas',model.surveys.filter(s=>!s.closed).length,'Recebendo a participação dos moradores'],
    ['Aguardando devolutiva',model.surveys.filter(s=>s.closed && !s.response).length,'Consultas encerradas sem decisão publicada'],
    ['Retornos publicados',model.surveys.filter(s=>s.closed && s.response).length,'Decisões disponíveis para acompanhamento']]) {
    const item=el('div',undefined,{class:'admin-metric'});item.append(el('p',label),el('strong',String(value)),el('small',description));metrics.append(item);
  }
  container.append(metrics);
  const attention=panel('Precisa de atenção',2,'admin-attention');
  attention.append(el('p','Resolva as tarefas pendentes e mantenha os moradores informados.',{class:'quiet'}));
  const items=[...model.requests.filter(r=>r.status==='Pendente').map(r=>({kind:'cleaning',title:`Higiene da academia · ${r.protocol}`,description:r.description,label:'Abrir tarefa',href:`#limpeza/${r.protocol}`})),
    ...model.surveys.filter(s=>s.closed && !s.response).map(s=>({kind:'response',title:s.title,description:'Consulta encerrada. Os moradores aguardam a decisão e o próximo passo.',label:'Publicar devolutiva',href:`#consulta/${s.id}`}))];
  if(!items.length)attention.append(el('p','Nenhuma pendência no momento',{class:'no-pending'}));
  for(const item of items) {
    const row=el('div',undefined,{class:'attention-item','data-kind':item.kind});
    const text=el('div');text.append(badge(item.kind==='cleaning'?'Limpeza pendente':'Aguardando devolutiva'),el('h3',item.title),el('p',item.description));
    row.append(text,link(item.label,item.href,'secondary'));attention.append(row);
  }
  container.append(attention);return container;
}
function introDismissed() {
  try { return localStorage.getItem(INTRO_KEY)==='dispensada'; } catch { return false; }
}
function rememberIntro() {
  try { localStorage.setItem(INTRO_KEY,'dispensada'); } catch { /* A introdução continua utilizável sem storage. */ }
}
function showAdminIntro(origin = document.querySelector('#main')) {
  if(!model?.admin)return;
  introState={mode:'welcome',step:0,originId:origin.id || 'main',originMenu:adminMenuOpen};
  renderAdminIntro();
}
function dismissAdminIntro(restore = true) {
  if(!introState)return;
  const previous=introState;introState=null;rememberIntro();
  document.querySelectorAll('.tour-target').forEach(node=>node.classList.remove('tour-target'));
  document.body.classList.remove('admin-touring');
  if(adminDialog.open)adminDialog.close();
  setAdminMenu(restore && previous.originMenu);
  if(restore) {
    const origin=document.getElementById(previous.originId);
    const visible=origin && origin.getClientRects().length && getComputedStyle(origin).visibility!=='hidden' && !origin.closest('[inert]');
    (visible ? origin : adminMobile() ? adminMenu : document.querySelector('#main')).focus();
  }
}
function startAdminTour() {
  rememberIntro();introState.mode='tour';introState.step=0;
  history.replaceState(null,'','#visao-geral');draw();
}
function renderAdminIntro() {
  if(!introState || !model?.admin)return;
  document.querySelectorAll('.tour-target').forEach(node=>node.classList.remove('tour-target'));
  const touring=introState.mode==='tour';
  document.body.classList.toggle('admin-touring',touring);adminDialog.className=touring?'tour-dialog':'welcome-dialog';
  const close=el('button','×',{type:'button',class:'intro-close','aria-label':'Fechar introdução'});close.addEventListener('click',()=>dismissAdminIntro());
  const title=el('h2',undefined,{id:'admin-intro-title'});const text=el('p',undefined,{id:'admin-intro-text'});
  const controls=el('div',undefined,{class:'intro-controls'});
  const makeButton=(label,action,className='primary')=>{const button=el('button',label,{type:'button',class:className});button.addEventListener('click',action);return button;};
  if(!touring) {
    title.textContent='Boas-vindas ao painel da gestão';
    text.textContent='Aqui você pode criar consultas, convidar os moradores a participar e acompanhar o que ainda precisa de retorno. Para começar, abra a Visão geral e veja suas pendências. Ao encerrar uma consulta, publique a decisão e o próximo passo para que os moradores saibam o que aconteceu.';
    controls.append(makeButton('Fazer tour',startAdminTour),makeButton('Agora não',()=>dismissAdminIntro(),'secondary'));
    adminDialog.replaceChildren(close,el('span','PR',{class:'intro-mark','aria-hidden':'true'}),title,text,controls);
  } else {
    const steps=[
      {title:'Visão geral',text:'Veja quais consultas estão abertas e quais aguardam retorno.',selector:'[data-admin-section="visao-geral"]'},
      {title:'Criar consulta',text:'Cadastre a pergunta e as opções que os moradores poderão escolher.',selector:'#admin-create-shortcut'},
      {title:'Devolutivas',text:'Depois do encerramento, publique a decisão e informe o próximo passo.',selector:'[data-admin-section="devolutivas"]'}
    ];
    const step=steps[introState.step];title.textContent=step.title;text.textContent=step.text;
    if(adminMobile())setAdminMenu(introState.step!==1);
    if(introState.step>0)controls.append(makeButton('Voltar',()=>{introState.step--;renderAdminIntro();},'secondary'));
    const next=makeButton(introState.step===2?'Concluir tour':'Avançar',()=>{if(introState.step===2)dismissAdminIntro();else{introState.step++;renderAdminIntro();}});next.id='intro-next';controls.append(next);
    adminDialog.replaceChildren(close,el('p',`${introState.step+1} de 3`,{class:'tour-progress','aria-live':'polite'}),title,text,controls);
    const target=document.querySelector(step.selector);
    if(target) {target.classList.add('tour-target');target.scrollIntoView({block:'center',inline:'nearest'});}
  }
  if(!adminDialog.open)adminDialog.showModal();
  (touring ? adminDialog.querySelector('#intro-next') : close).focus();
}
adminDialog.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const controls=[...adminDialog.querySelectorAll('button:not([disabled]),a[href]')].filter(node=>node.getClientRects().length);
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey && (document.activeElement===first || !adminDialog.contains(document.activeElement))){event.preventDefault();last?.focus();}
  else if(!event.shiftKey && (document.activeElement===last || !adminDialog.contains(document.activeElement))){event.preventDefault();first?.focus();}
});
adminDialog.addEventListener('cancel',event=>{event.preventDefault();dismissAdminIntro();});
adminMenu.addEventListener('click',()=>setAdminMenu(!adminMenuOpen,true));
document.querySelector('#admin-backdrop').addEventListener('click',()=>setAdminMenu(false,true));
document.addEventListener('keydown',event=>{if(event.key==='Escape' && adminMenuOpen && !adminDialog.open){event.preventDefault();setAdminMenu(false,true);}});
matchMedia('(max-width: 760px)').addEventListener('change',()=>{
  if(!model?.admin)return;
  const sidebarFocus=adminMobile() && navigation.contains(document.activeElement);
  setAdminMenu(false);
  if(introState?.mode==='tour')renderAdminIntro();
  else if(sidebarFocus && !adminDialog.open)adminMenu.focus();
});

function draw() {
  if(!model)return;
  logout.hidden=false;
  document.querySelector('#residential-name').textContent=model.name;
  const profile=document.querySelector('#profile');profile.hidden=false;profile.textContent=model.admin?'Gestão':'Morador';
  const current=route();
  const nav=el('nav',undefined,{'aria-label':'Navegação do portal',class:'portal-nav'});
  for(const [label,to] of [['Consultas','consultas'],['Acompanhamento','acompanhamento'],[model.admin ? 'Fila de limpeza' : 'Minhas solicitações',model.admin ? 'limpeza' : 'solicitacoes'],['Regras e contatos','regras']]){
    const a=link(label,`#${to}`);
    if(current===to || (to==='limpeza' && current.startsWith('limpeza/')) || (to==='consultas' && (current.startsWith('consulta/') || current.startsWith('gestao/'))))a.setAttribute('aria-current','page');
    nav.append(a);
  }
  if (model.admin) renderAdminShell(current);
  else {
    resetAdminShell();
    navigation.replaceChildren(nav);
  }
  let page;
  const match=current.match(/^consulta\/([0-9]{1,12})$/);
  if(match){
    const survey=model.surveys.find(s=>s.id===Number(match[1]));
    page=survey ? detail(survey) : heading('Consulta não encontrada','A consulta não está disponível. Use a navegação para voltar à lista.');
  } else if(current==='visao-geral') page=model.admin ? adminOverview() : heading('Área exclusiva da gestão','Use Consultas para participar e acompanhar os resultados.');
  else if(current==='devolutivas') page=model.admin ? tracking('Devolutivas') : heading('Área exclusiva da gestão','Use Acompanhamento para consultar os retornos.');
  else if(current==='acompanhamento')page=tracking(model.admin ? 'Devolutivas' : 'Acompanhamento');
  else if(current==='regras')page=resources();
  else if(current==='solicitacoes') {
    page=model.admin ? heading('Área exclusiva do morador', 'Use Fila de limpeza para consultar e concluir ordens.') : requestsPage();
  } else if(current==='limpeza' || current.startsWith('limpeza/')) {
    if (!model.admin) page=heading('Área exclusiva da gestão','Use Minhas solicitações para acompanhar os protocolos da sua residência.');
    else if(current==='limpeza') page=cleaningQueue();
    else {
      const item=model.requests.find(item => `limpeza/${item.protocol}`===current);
      page=item ? cleaningDetail(item) : heading('Ordem não encontrada','Use Fila de limpeza para consultar as ordens disponíveis.');
    }
  }
  else if(current==='gestao/nova' || current==='gestao/convites'){
    page=model.admin ? (current==='gestao/nova' ? createSurvey() : invites()) : heading('Área exclusiva da gestão','Use Consultas para participar e Acompanhamento para conferir os retornos.');
  } else {
    if(current!=='consultas') history.replaceState(null,'',model.admin ? '#visao-geral' : '#consultas');
    page=model.admin && current!=='consultas' ? adminOverview() : dashboard();
  }
  content.replaceChildren(page);
  document.title=`${content.querySelector('h1').textContent} · Prioridades do Residencial`;
  if (model.admin && introState?.mode==='tour') renderAdminIntro();
}
document.querySelector('.skip').addEventListener('click', event => { event.preventDefault(); focusPage(); });
window.addEventListener('hashchange',()=>{if(model){message();draw();focusPage();}});
logout.addEventListener('click',()=>{
  sessionGeneration += 1;
  code='';model=null;message();history.replaceState(null,'',location.pathname+location.search);login();document.querySelector('#access').focus();
});
login();
