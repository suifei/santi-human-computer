import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { asset } from '@/lib/utils'

document.documentElement.style.setProperty(
  '--paper-grain-image',
  `url("${asset('paper-grain.jpg')}")`,
)

/** `base: './'`（kimi.link / 本地）不设 basename；GitHub Pages 用 `/santi-human-computer/` */
function routerBasename(): string | undefined {
  const base = import.meta.env.BASE_URL
  if (!base || base === '/' || base === './') return undefined
  return base.endsWith('/') ? base.slice(0, -1) : base
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={routerBasename()}>
    <App />
  </BrowserRouter>,
)
