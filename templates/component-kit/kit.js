const byId = id => document.getElementById(id);
byId('note-form').onsubmit = event => {
  event.preventDefault();
  const note = byId('note').value.trim();
  if (!note) {
    byId('note').setCustomValidity('Describe a next step.');
    byId('note').reportValidity();
    return;
  }
  byId('note-status').textContent = `For this session: ${note}`;
};
byId('note').oninput = () => byId('note').setCustomValidity('');
byId('open-dialog').onclick = () => byId('example-dialog').showModal();
byId('close-dialog').onclick = () => byId('example-dialog').close();
