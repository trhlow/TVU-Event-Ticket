import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {runLegacyStorageCleanup} from './lib/legacyStorageCleanup';
import './index.css';

// Before anything renders: drop the fixture data earlier builds left in this browser.
runLegacyStorageCleanup();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
