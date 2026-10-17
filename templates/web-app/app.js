const byId = id => document.getElementById(id);
const storageKey = 'visual-core-fieldnotes-v1';
let projects = [];
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) {
    projects = saved.filter(project => project && typeof project === 'object' &&
      typeof project.id === 'string' && typeof project.title === 'string' &&
      typeof project.description === 'string' && typeof project.done === 'boolean');
  }
} catch {
  byId('status').textContent = 'Saved projects could not be read in this browser.';
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(projects));
    return true;
  } catch {
    byId('status').textContent = 'Storage is unavailable. Changes last only while this page is open.';
    return false;
  }
}

function open() {
  byId('form').reset();
  byId('title').setCustomValidity('');
  byId('dialog').showModal();
  byId('title').focus();
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function render() {
  const query = byId('search').value.trim().toLowerCase();
  const filter = byId('filter').value;
  const visible = projects.filter(project => project.title.toLowerCase().includes(query) &&
    (filter === 'all' || project.done === (filter === 'done')));
  byId('projects').replaceChildren();
  byId('empty').hidden = visible.length > 0;

  for (const project of visible) {
    const card = element('article', '', 'card vc-card');
    card.dataset.id = project.id;
    card.dataset.done = project.done;
    const header = document.createElement('header');
    header.append(
      element('span', project.done ? 'Completed' : 'In progress', 'vc-eyebrow'),
      element('h2', project.title),
      element('p', project.description || 'Choose a next step when you’re ready.', 'vc-muted')
    );
    card.append(header);
    const footer = document.createElement('footer');
    const toggle = element('button', project.done ? 'Reopen' : 'Mark complete', 'btn vc-quiet');
    toggle.dataset.variant = 'outline';
    toggle.setAttribute('aria-label', `${project.done ? 'Reopen' : 'Complete'} ${project.title}`);
    toggle.onclick = () => {
      project.done = !project.done;
      const persisted = save();
      render();
      if (persisted) byId('status').textContent = `${project.title} ${project.done ? 'completed' : 'reopened'}.`;
      const replacement = [...byId('projects').children].find(node => node.dataset.id === project.id);
      (replacement?.querySelector('button') || byId('filter')).focus();
    };
    footer.append(element('span', 'One step at a time', 'vc-muted'), toggle);
    card.append(footer);
    byId('projects').append(card);
  }
}

byId('new').onclick = open;
byId('empty-new').onclick = open;
byId('cancel').onclick = () => byId('dialog').close();
byId('search').oninput = render;
byId('filter').onchange = render;
byId('title').oninput = () => byId('title').setCustomValidity('');
byId('form').onsubmit = event => {
  event.preventDefault();
  const title = byId('title').value.trim();
  if (!title) {
    byId('title').setCustomValidity('Enter a project name.');
    byId('title').reportValidity();
    return;
  }
  projects.unshift({id: crypto.randomUUID(), title, description: byId('description').value.trim(), done: false});
  const persisted = save();
  byId('dialog').close();
  byId('search').value = '';
  byId('filter').value = 'all';
  render();
  if (persisted) byId('status').textContent = `Created ${title}.`;
};
render();
