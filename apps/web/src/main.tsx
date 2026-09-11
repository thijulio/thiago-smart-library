import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@thijulio/biome-css/biome.css';
import '@thijulio/biome-react/styles.css';
import './styles.css';
import { App } from './app/app';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
