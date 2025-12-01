// Shared page matrix for smoke coverage; extend when new pages are added.
export const pages = [
  { name: 'dashboard', module: 'Dashboard', tab: 'dashboard', selector: '#dashboard-page' },
  { name: 'sparkqueue', module: 'Sparkqueue', tab: 'sparkqueue', selector: '#sparkqueue-page' },
  // Queues page is aliased to the SparkQueue tab
  { name: 'queues', module: 'Queues', tab: 'sparkqueue', selector: '#sparkqueue-page' },
  { name: 'enqueue', module: 'Enqueue', tab: 'enqueue', selector: '#enqueue-page' },
  { name: 'config', module: 'Config', tab: 'config', selector: '#config-page' },
  { name: 'scripts', module: 'Scripts', tab: 'scripts', selector: '#scripts-page' },
  // Tasks page module exists even if no dedicated tab is present
  { name: 'tasks', module: 'Tasks', tab: null, selector: null },
];
