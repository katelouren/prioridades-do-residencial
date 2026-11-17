// Componente isolado. Dados da conversa somente em memória da sessão autenticada.
window.PRassistant = (() => {
  let root, panel, launcher, log, input, send, pending=false, generation=0, draftNumber=0;
  const node=(tag,text,attrs={})=>el(tag,text,attrs);
  function bubble(text,kind='assistant') {
    const box=node('div',undefined,{class:`pr-chat-bubble pr-chat-${kind}`});
    box.append(node('p',text));log.append(box);reveal(box);return box;
  }
  function reveal(box) { requestAnimationFrame(()=>{if(box.isConnected)box.scrollIntoView({block:'nearest'});}); }
  function close() {if(!panel)return;panel.hidden=true;launcher.hidden=false;launcher.setAttribute('aria-expanded','false');position();launcher.focus({preventScroll:true});}
  function open() {panel.hidden=false;launcher.hidden=true;launcher.setAttribute('aria-expanded','true');position();input.focus({preventScroll:true});}
  function position() {
    if(!root)return;
    const view=window.visualViewport;
    root.style.setProperty('--pr-chat-height',`${view?.height || innerHeight}px`);
    root.style.setProperty('--pr-chat-bottom',`${Math.max(0,innerHeight-(view?.height || innerHeight)-(view?.offsetTop || 0))}px`);
    // Move somente o botão, sem criar espaçamento ou alterar a página existente.
    root.style.setProperty('--pr-chat-lift','0px');
    if(launcher && !launcher.hidden) {
      const rect=launcher.getBoundingClientRect();
      const controls=[...document.querySelectorAll('#main button,#main a[href],#main input,#main textarea,#main select')]
        .filter(item=>item.getClientRects().length).map(item=>item.getBoundingClientRect());
      for(let lift=0;lift<rect.top-70;lift+=64) {
        if(!controls.some(item=>item.right>rect.left && item.left<rect.right && item.bottom>rect.top-lift && item.top<rect.bottom-lift)) {
          root.style.setProperty('--pr-chat-lift',`${lift}px`);break;
        }
      }
    }
  }
  function reset() {generation++;root?.remove();root=panel=launcher=log=input=send=null;pending=false;}
  async function run(button,action) {
    if(button.disabled)return;
    button.disabled=true;const stamp=generation;
    try {await action();}
    catch(error){if(stamp===generation && root)bubble(error.message+' Você pode tentar novamente.','error');}
    finally {if(stamp===generation)button.disabled=false;}
  }
  function fieldIn(form,label,id,tag='input',attrs={}) {
    const wrap=node('label',label,{for:id});const control=node(tag,undefined,{id,...attrs});form.append(wrap,control);return control;
  }
  function cleaning(message='') {
    const box=bubble('Revise o pedido. Nesta etapa, atendemos a higiene da academia. Nenhum chamado é criado antes de confirmar.');
    const form=node('form');const draft=++draftNumber;
    const local=fieldIn(form,'Local do chamado',`pr-chat-local-${draft}`,'input',{required:'',maxlength:'80'});local.value=/academia/i.test(message)?'Academia':'';
    const description=fieldIn(form,'Descrição do chamado',`pr-chat-description-${draft}`,'textarea',{required:'',maxlength:'1500',rows:'3'});description.value=message;
    const team=fieldIn(form,'Equipe de destino',`pr-chat-team-${draft}`,'input',{readonly:''});team.value='Equipe de limpeza';
    form.append(node('small','O servidor valida o local e define a equipe de destino.'));
    const button=node('button','Preparar chamado',{type:'submit'});form.append(button);box.append(form);
    let token=null,done=false;const stamp=generation;
    const invalidate=()=>{if(!done){token=null;button.textContent='Preparar chamado';}};
    local.addEventListener('input',invalidate);description.addEventListener('input',invalidate);
    form.addEventListener('submit',event=>{event.preventDefault();if(done)return;
      run(button,async()=>{
        local.readOnly=description.readOnly=true;
        try {
        if(!token) {
          const result=await api('/api/assistant/cleaning/preview',{local:local.value,description:description.value});
          if(stamp!==generation)return;
          if(!result.ready){bubble(result.message);return;}
          token=result.token;local.value=result.summary.local;description.value=result.summary.description;team.value=result.summary.team;
          button.textContent='Confirmar chamado';reveal(button);button.focus({preventScroll:true});
        } else {
          const result=await api('/api/assistant/cleaning/confirm',{token,local:local.value,description:description.value});
          if(stamp!==generation)return;
          model.requests=[result.request,...model.requests.filter(item=>item.protocol!==result.request.protocol)];
          if(route()==='solicitacoes')draw();
          done=true;form.replaceChildren(node('p',`Chamado confirmado. Protocolo ${result.request.protocol}. Encaminhado para ${result.request.team || 'Equipe de limpeza'}.`));
          box.append(serviceCard(result.request));reveal(box);
        }
        } finally {local.readOnly=description.readOnly=false;}
      });
    });reveal(box);local.focus({preventScroll:true});
  }
  async function ask(text) {
    if(pending || !text.trim())return;
    bubble(text,'user');input.value='';
    pending=true;send.disabled=true;input.setAttribute('aria-busy','true');
    const stamp=generation;const loading=bubble('Consultando as informações publicadas…');
    try {
      const result=await api('/api/assistant/question',{question:text});if(stamp!==generation)return;
      if(result.intent==='cleaning'){loading.remove();cleaning(text);return;}
      loading.replaceChildren(node('small',result.mode==='live'?'Resposta do Gemini':'Orientações locais do PR'),node('p',result.answer));
      for(const source of result.sources) {
        const details=node('details');details.append(node('summary',`Trecho publicado · ${source.id}`),node('p',source.content));
        const sourceLink=node('a',source.title,{href:source.href});sourceLink.addEventListener('click',()=>{close();if(location.hash===source.href)requestAnimationFrame(focusPage);});
        loading.append(sourceLink,details);
      }reveal(loading);
    } catch(error) {if(stamp===generation)loading.replaceChildren(node('small','Orientações locais do PR'),node('p',error.message),node('p','Consulte Consultas e Regras e contatos. Você também pode preencher um pedido de limpeza manualmente.'));}
    finally {if(stamp===generation){pending=false;send.disabled=false;input.removeAttribute('aria-busy');}}
  }
  function sync() {
    if(!model || model.admin){reset();return;}
    if(root)return;
    root=node('div',undefined,{id:'pr-assistant'});
    launcher=node('button',undefined,{type:'button',class:'pr-chat-launcher','aria-expanded':'false','aria-controls':'pr-assistant-panel','aria-haspopup':'dialog'});
    const icon=node('span','',{'aria-hidden':'true'});
    // Ícone genérico de conversa, sem marca de provedor.
    icon.textContent='';icon.className='pr-chat-icon';
    launcher.append(icon,node('span','Pergunte ao assistente'));launcher.addEventListener('click',open);
    panel=node('section',undefined,{id:'pr-assistant-panel',role:'dialog','aria-modal':'false','aria-labelledby':'pr-chat-title'});panel.hidden=true;
    const header=node('header');header.append(node('h2','Assistente do Residencial',{id:'pr-chat-title'}));
    const dismiss=node('button','×',{type:'button','aria-label':'Fechar assistente'});dismiss.addEventListener('click',close);header.append(dismiss);
    log=node('div',undefined,{class:'pr-chat-log',role:'log','aria-live':'polite','aria-label':'Conversa com o assistente',tabindex:'0'});
    const suggestions=node('div',undefined,{class:'pr-chat-suggestions','aria-label':'Sugestões'});
    for(const text of ['Quais consultas estão abertas?','O que a gestão decidiu sobre o evento?','Solicitar limpeza']) {
      const suggestion=node('button',text,{type:'button'});suggestion.addEventListener('click',()=>{if(text==='Solicitar limpeza')cleaning();else ask(text);});suggestions.append(suggestion);
    }
    const form=node('form',undefined,{class:'pr-chat-composer'});
    input=fieldIn(form,'Mensagem','pr-chat-message','textarea',{required:'',maxlength:'1500',rows:'2',placeholder:'Como posso ajudar?'});
    send=node('button','Enviar',{type:'submit','aria-label':'Enviar mensagem'});form.append(send);
    form.addEventListener('submit',event=>{event.preventDefault();ask(input.value);});
    input.addEventListener('keydown',event=>{if(event.key==='Enter' && !event.shiftKey && !event.isComposing){event.preventDefault();if(form.reportValidity())ask(input.value);}});
    const update=node('button','Atualizar meus chamados',{type:'button',class:'pr-chat-update'});
    update.addEventListener('click',()=>run(update,async()=>{
      const stamp=generation;const result=await api('/api/requests');if(stamp!==generation)return;
      model.requests=result.requests;if(route()==='solicitacoes')draw();
      const box=bubble(result.requests.length?'Andamento dos chamados da sua residência:':'Nenhum chamado da sua residência.');
      for(const item of result.requests) {
        const previous=[...log.querySelectorAll('.request-card')].find(card=>card.dataset.protocol===item.protocol);
        if(previous)previous.replaceWith(serviceCard(item));else box.append(serviceCard(item));
      }reveal(box);
    }));
    panel.append(header,log,suggestions,update,form,node('small','Use apenas informações necessárias, sem dados pessoais. Enter envia; Shift + Enter cria uma nova linha.',{class:'pr-chat-note'}));
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
    root.append(panel,launcher);document.body.append(root);bubble('Olá! Posso ajudar com consultas, devolutivas publicadas e pedidos de limpeza.');position();
  }
  window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);window.addEventListener('resize',position);
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && panel && !panel.hidden){event.preventDefault();close();}});
  let scrollFrame;window.addEventListener('scroll',()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(position);},{passive:true});
  return {sync,reset,open};
})();
