import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ToastProvider } from './components/ui/toast';
import { ImportingProvider } from './components/ui/importing';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ImportingProvider>
        <App />
      </ImportingProvider>
    </ToastProvider>
  </StrictMode>
);
