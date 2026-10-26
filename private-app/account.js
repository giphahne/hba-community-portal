/* Change my password: the signed-in member confirms the current (or temporary) password and chooses a new one.
   Board-issued temporary passwords are handled on the sign-in page; this dialog is for a member's own account. */
(() => {
  'use strict';
  window.openHBAPasswordChange=function(){
    const C=window.HBACommunity;
    if(!C||!C.member){alert('Sign in first to change your password.');return;}
    const form=C.formDialog('Change my password',`<p>Signed in as <strong>${String(C.member.email||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</strong>. Enter your current password, then choose a new one of at least 10 characters.</p>
      <label>Current password<input name="current_password" type="password" autocomplete="current-password" required maxlength="200"></label>
      <label>New password<input name="new_password" type="password" autocomplete="new-password" required minlength="10" maxlength="200"></label>
      <label>New password again<input name="repeat_password" type="password" autocomplete="new-password" required minlength="10" maxlength="200"></label>
      <label class="community-check"><input type="checkbox" id="account-show-passwords"> Show passwords</label>`,
      async fd=>{
        if(fd.get('new_password')!==fd.get('repeat_password'))throw Error('The two new passwords do not match. Type the same new password in both boxes.');
        await C.api('/api/account/password',{method:'POST',body:JSON.stringify({current_password:fd.get('current_password'),new_password:fd.get('new_password')})});
        document.dispatchEvent(new CustomEvent('hba-password-changed'));
        alert('Your new password is saved. Use it the next time you sign in.');
      },{},'Save new password');
    form.querySelector('#account-show-passwords').onchange=e=>form.querySelectorAll('input[type=password],input[data-pw]').forEach(i=>{i.dataset.pw='1';i.type=e.target.checked?'text':'password';});
  };
})();
