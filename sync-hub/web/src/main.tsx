import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const slug = window.location.pathname.replace(/^\//, '').replace(/\.md$/, '') || ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App slug={slug} />
  </StrictMode>
)
