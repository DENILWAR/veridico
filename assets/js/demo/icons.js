// Verídico demo icon set: minimal 24×24 line icons, one stroke weight, currentColor.
// Original drawings (no third-party or platform icons).
const svg = (body) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  // ORDR: stacked records
  ordr: svg('<rect x="4" y="4" width="16" height="5" rx="1.5"/><rect x="4" y="10.5" width="16" height="4" rx="1.5"/><rect x="4" y="16" width="10" height="4" rx="1.5"/>'),
  // SON Files: folder with sheet
  files: svg('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M8 13h8"/>'),
  // SON Browser: window + compass needle
  browser: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 8.5h17"/><path d="M14.5 11.5l-1.6 4.1-4.1 1.6 1.6-4.1z"/>'),
  // Session activity: pulse line
  activity: svg('<path d="M3 12h4l2.2-5 3.6 10 2.2-5H21"/>'),
  // Verídico Intelligence: structured spark (node + rays)
  intelligence: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>'),
  // Summary: report
  summary: svg('<path d="M6.5 3.5h8l4 4v13h-12z"/><path d="M14.5 3.5v4h4"/><path d="M9.5 12.5h6M9.5 16h4"/>'),
  metrics: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  chat: svg('<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/>'),
  overview: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  workflows: svg('<circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><path d="M8 6h4a4 4 0 0 1 4 4M8 18h4a4 4 0 0 0 4-4"/>'),
  recommendations: svg('<path d="M12 3.5l2.3 4.7 5.2.7-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.8-3.6 5.2-.7z"/>'),
  sources: svg('<path d="M9 7V3.5M15 7V3.5"/><path d="M6.5 7h11v4a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.5v4"/>'),
  guide: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/>'),
  forward: svg('<path d="M4.5 6.5l7 5.5-7 5.5zM12.5 6.5l7 5.5-7 5.5z"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>'),
  send: svg('<path d="M4 12h14M13 6.5l5.5 5.5-5.5 5.5"/>'),
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
};
