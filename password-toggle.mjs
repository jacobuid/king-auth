export const EYE_PATH='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z';
export const EYE_SLASH_PATH='M3 3l18 18';
export function eyeMarkup(visible){return '<svg class="king-auth-password-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="'+EYE_PATH+'"/><circle cx="12" cy="12" r="3"/>'+(visible?'<path d="'+EYE_SLASH_PATH+'"/>':'')+'</svg>';}

/** Add unstyled toggles to the central portal and owner recovery forms. */
export function mountPasswordToggles(root=document){
  let sequence=0;
  for(const input of root.querySelectorAll('input[type="password"]')){
    if(input.dataset.kingAuthPassword!==undefined)continue;
    input.dataset.kingAuthPassword='';
    if(!input.id){do{input.id='king-auth-password-'+(++sequence);}while(document.querySelectorAll('[id="'+input.id+'"]').length>1);}
    const label=[...root.querySelectorAll('label')].find(item=>item.htmlFor===input.id)?.textContent?.trim()||'password';
    const wrapper=document.createElement('span');wrapper.className='king-auth-password';input.before(wrapper);
    const button=document.createElement('button');button.type='button';button.className='king-auth-password-toggle';button.setAttribute('aria-controls',input.id);
    const update=visible=>{input.type=visible?'text':'password';button.setAttribute('aria-label',(visible?'Hide ':'Show ')+label.toLowerCase());button.setAttribute('aria-pressed',String(visible));button.innerHTML=eyeMarkup(visible);};
    button.addEventListener('click',()=>update(input.type==='password'));
    input.form?.addEventListener('reset',()=>update(false));
    wrapper.append(input,button);update(false);
  }
}
