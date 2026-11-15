import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App.jsx';
import { Theme } from '@astryxdesign/core/theme';
import { themes, defaultThemeSlug } from './astryx-themes.js';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><Theme theme={themes[defaultThemeSlug]} mode="light"><App /><Analytics /></Theme></React.StrictMode>,
);
