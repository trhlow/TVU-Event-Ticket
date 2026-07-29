import React from 'react';
import { BrowserRouter } from 'react-router';
import AppRoutes from './routes/AppRoutes';
import EnvConfigErrorScreen from './components/common/EnvConfigErrorScreen';
import { ToastProvider } from './components/common/ToastProvider';
import { validateAppEnv } from './lib/env';

export default function App() {
  const { ok, errors } = validateAppEnv();

  if (!ok) {
    return <EnvConfigErrorScreen errors={errors} />;
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </BrowserRouter>
  );
}
