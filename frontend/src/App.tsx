import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import EnvConfigErrorScreen from './components/common/EnvConfigErrorScreen';
import ProductionSafetyBanner from './components/common/ProductionSafetyBanner';
import { validateAppEnv } from './lib/env';

export default function App() {
  const { ok, errors, warnings } = validateAppEnv();

  if (!ok) {
    return <EnvConfigErrorScreen errors={errors} />;
  }

  return (
    <BrowserRouter>
      <ProductionSafetyBanner warnings={warnings} />
      <AppRoutes />
    </BrowserRouter>
  );
}
