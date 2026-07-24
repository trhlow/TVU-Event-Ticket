import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import EnvConfigErrorScreen from './components/common/EnvConfigErrorScreen';
import ProductionSafetyBanner from './components/common/ProductionSafetyBanner';
import { ToastProvider } from './components/common/ToastProvider';
import { validateAppEnv } from './lib/env';

export default function App() {
  const { ok, errors, warnings } = validateAppEnv();

  if (!ok) {
    return <EnvConfigErrorScreen errors={errors} />;
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        <ProductionSafetyBanner warnings={warnings} />
        <AppRoutes />
      </ToastProvider>
    </BrowserRouter>
  );
}
