import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { registerSW } from 'virtual:pwa-register';

const app = mount(App, {
  target: document.getElementById('app'),
});

// Auto-updating service worker: keeps the installed PWA in sync on reload.
registerSW({ immediate: true });

export default app;
