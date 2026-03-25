import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';

// Hard-disable console output in production builds (prevents leaking sensitive data).
if (!import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noop = () => {};
  // @ts-expect-error override for safety in prod
  console.log = noop;
  // @ts-expect-error override for safety in prod
  console.debug = noop;
  // @ts-expect-error override for safety in prod
  console.info = noop;
  // @ts-expect-error override for safety in prod
  console.warn = noop;
  // @ts-expect-error override for safety in prod
  console.error = noop;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);