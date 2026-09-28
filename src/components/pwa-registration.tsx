'use client';
import { useEffect } from 'react';
export function PwaRegistration() { useEffect(() => { if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => { /* Installation support is optional when browser policy blocks service workers. */ }); }, []); return null; }
