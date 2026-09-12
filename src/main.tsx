import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/yeseva-one/400.css'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/400-italic.css'
import App from './App.tsx'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('root missing')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
