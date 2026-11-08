/* VektörPad icon set: 24x24 line icons drawn for this app.
   Style follows the desktop-suite dark theme: thin light strokes (currentColor, the CSS sets the
   stroke width), mostly unfilled glyphs, with small colour accents (green "new" badge, orange/red
   paint on fill tools, blue guides). The flyout triangle of toolbox buttons is drawn by CSS, not here. */
(function () {
  /* accent colours (same in light and dark theme) */
  const GRN = '#3dba5c', ORG = '#f08a2a', RED = '#e2483d', BLU = '#3d8ee0';
  /* knock-out colour for glyphs drawn on top of a filled light area (follows the panel colour) */
  const KO = 'style="stroke:var(--panel,#262626)"';

  /* ---------- helpers ---------- */
  const f = (d, c) => '<path d="' + d + '" fill="' + (c || 'currentColor') + '" stroke="none"/>';
  const checker = (x, y, s, n) => {
    let d = '';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2 === 0) d += 'M' + (x + i * s) + ' ' + (y + j * s) + 'h' + s + 'v' + s + 'h-' + s + 'z';
    return f(d) + '<rect x="' + x + '" y="' + y + '" width="' + s * n + '" height="' + s * n + '"/>';
  };
  const gear = (cx, cy, ro, ri, n) => {
    const pt = (a, r) => (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2);
    let d = '';
    for (let k = 0; k < n; k++) {
      const a = (k * 2 * Math.PI) / n - Math.PI / 2;
      d += (k ? 'L' : 'M') + pt(a - 0.3, ri) + 'L' + pt(a - 0.17, ro) + 'L' + pt(a + 0.17, ro) + 'L' + pt(a + 0.3, ri);
    }
    return '<path d="' + d + 'z"/>';
  };
  /* page outline whose top-right corner is cut away for a badge */
  const PAGE_B = '<path d="M13.5 4.5H6.5a1 1 0 00-1 1v14a1 1 0 001 1h11a1 1 0 001-1v-8.5"/>';
  const badge = (c) => '<rect x="14.6" y="2.6" width="6.8" height="6.8" rx="1.2" fill="' + (c || GRN) + '" stroke="none"/>';
  const PAGE = '<path d="M6.5 3.5h8l4 4v12a1 1 0 01-1 1h-11a1 1 0 01-1-1v-15a1 1 0 011-1z"/><path d="M14.5 3.5v4h4"/>';
  const ARROW = (x, y) => f('M' + x + ' ' + y + 'v13.6l3.3-3.1 2.3 5.1 2.1-.9-2.3-5 4.6-.3z');
  const FLOPPY = '<path d="M5.5 4.5h10.8l3.2 3.2v10.8a1 1 0 01-1 1h-13a1 1 0 01-1-1v-13a1 1 0 011-1z"/><path d="M8.5 4.5v4h7v-4M7.5 19.5v-5.5h9v5.5"/>';
  const TRAY = '<path d="M9 8H5.5a1 1 0 00-1 1v10a1 1 0 001 1h13a1 1 0 001-1V9a1 1 0 00-1-1H15"/>';
  const CLOUD = '<path d="M8 18.5H6.8a3.6 3.6 0 01-.4-7.2A5.6 5.6 0 0117.3 10a4.3 4.3 0 01.4 8.5H16"/>';
  const EYEDROP = f('M6.3 15.6l4.1-4.1 2.4 2.4-4.1 4.1-3.6 1.2z', ORG) +
    f('M15 4.2a2.3 2.3 0 013.2 0l1.6 1.6a2.3 2.3 0 010 3.2l-1.9 1.9-4.8-4.8z') +
    '<path d="M11.6 6.9l5.5 5.5M13.3 8.6l-7.6 7.6-1.2 3.6 3.6-1.2 7.6-7.6"/>';
  const bucket = (paint) =>
    '<path d="M4.3 11.6l6.9-6.9 6.9 6.9-6.9 6.9z"/>' + f('M5.1 12.4h12.2l-6.1 6.1z', paint) +
    '<path d="M11.2 4.7L8.4 1.9M6.6 9.3c-1.6-1.6-1.9-3.6-.7-4.8 1-1 2.7-.9 4.1.2"/>' +
    f('M19.8 13.2c0 1.9 1.5 3 1.5 4.3a1.5 1.5 0 01-3 0c0-1.3 1.5-2.4 1.5-4.3z', paint);

  const P = {
    /* ----- toolbox ----- */
    select: ARROW(6.5, 3.5).replace('stroke="none"', 'stroke="currentColor" stroke-width="1"'),
    node: '<path d="M4.5 20.5V11a6.5 6.5 0 016.5-6.5h9.5"/><rect x="3" y="18.6" width="3" height="3" fill="currentColor" stroke="none"/><rect x="18.6" y="3" width="3" height="3" fill="currentColor" stroke="none"/>' +
      f('M9.5 8.8v9.2l2.3-2.1 1.6 3.5 1.5-.7-1.6-3.4 3.2-.2z').replace('stroke="none"', 'stroke="currentColor" stroke-width=".8"'),
    freehand: '<path d="M6.5 3v7M3 6.5h7"/><path d="M8.5 17.5c1.4-2.9 3-3.4 4.4-1.5 1.3 1.8 2.7 1.9 4.1-.2.9-1.4 1.9-1.9 3.5-1.4"/>',
    brush: '<path d="M20.2 3.8l-7.6 7.6"/><path d="M12 10.2l1.8 1.8"/>' +
      f('M11.3 12.3c-2.5-.4-4.2 1-4.7 3.3-.3 1.5-1.2 2.7-3 3.3 3.6.9 7.8-.4 8.5-3.9z'),
    pen: '<path d="M12 3.5l4.8 7.8-1.8 6.2H9l-1.8-6.2z"/><path d="M12 3.5v6.8"/><circle cx="12" cy="11.6" r="1.3"/><path d="M8.5 20.5h7"/>',
    line: '<path d="M5.5 18.5L18.5 5.5"/><rect x="3" y="17" width="4" height="4" fill="currentColor" stroke="none"/><rect x="17" y="3" width="4" height="4" fill="currentColor" stroke="none"/>',
    rect: '<rect x="4.5" y="4.5" width="15" height="15" rx=".6"/>',
    ellipse: '<circle cx="12" cy="12" r="7.8"/>',
    polygon: '<path d="M12 4l7.8 5.7-3 9.3H7.2l-3-9.3z"/>',
    star: '<path d="M12 3.4l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.2 6-.9z"/>',
    spiral: '<path d="M12.2 12.1c.1-.9 1.2-1.2 1.8-.6.9.8.4 2.4-.8 2.8-1.7.6-3.4-.8-3.4-2.6 0-2.4 2.4-4.2 4.8-3.6 3 .7 4.4 4.1 3.2 6.8-1.4 3.2-5.4 4.4-8.5 2.8"/>',
    text: '<path d="M5 20.5l7-17 7 17M7.6 14.2h8.8"/>',
    eyedropper: EYEDROP,
    hand: '<path d="M8.2 12.6V6.6a1.4 1.4 0 012.8 0v5"/><path d="M11 11.4V5.2a1.4 1.4 0 012.8 0v6.2"/><path d="M13.8 11.4V6.6a1.4 1.4 0 012.8 0V14c0 3.9-2.4 6.5-5.8 6.5-2.4 0-3.8-1.2-5.2-3.2l-1.9-2.8a1.4 1.4 0 012.2-1.7l2.3 2.4"/>',
    zoom: '<circle cx="10" cy="10" r="6"/><path d="M14.4 14.4l5.6 5.6" stroke-width="2.6"/>',
    zoomIn: '<circle cx="10" cy="10" r="6"/><path d="M14.4 14.4l5.6 5.6" stroke-width="2.6"/><path d="M7.4 10h5.2M10 7.4v5.2"/>',
    zoomOut: '<circle cx="10" cy="10" r="6"/><path d="M14.4 14.4l5.6 5.6" stroke-width="2.6"/><path d="M7.4 10h5.2"/>',
    fit: '<path d="M3.5 8.5v-5h5M15.5 3.5h5v5M20.5 15.5v5h-5M8.5 20.5h-5v-5"/><rect x="8" y="8" width="8" height="8" rx=".6"/>',
    undo: '<path d="M8.5 5L4.5 9l4 4"/><path d="M4.5 9H14a5.5 5.5 0 010 11h-4"/>',
    redo: '<path d="M15.5 5l4 4-4 4"/><path d="M19.5 9H10a5.5 5.5 0 000 11h4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    panels: '<rect x="3.5" y="4.5" width="17" height="15" rx="1"/><path d="M14.5 4.5v15M16.8 8h1.5M16.8 11h1.5"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 014.9.6c0 1.7-2.5 2.2-2.5 3.8"/><circle cx="12" cy="16.9" r=".6" fill="currentColor"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    chevDown: '<path d="M6 9.5l6 6 6-6"/>',
    chevUp: '<path d="M6 14.5l6-6 6 6"/>',
    chevLeft: '<path d="M14.5 6l-6 6 6 6"/>',
    chevRight: '<path d="M9.5 6l6 6-6 6"/>',
    /* ----- shaping / arrange ----- */
    weld: '<path d="M4 4h10v6h6v10H10v-6H4z" fill="currentColor" fill-opacity=".22"/>',
    trim: '<path d="M4 4h10v6h-4v4H4z" fill="currentColor" fill-opacity=".22"/><rect x="10" y="10" width="10" height="10" stroke-dasharray="2 2"/>',
    intersect: '<rect x="4" y="4" width="10" height="10" stroke-dasharray="2 2"/><rect x="10" y="10" width="10" height="10" stroke-dasharray="2 2"/><rect x="10" y="10" width="4" height="4" fill="currentColor" stroke="none"/>',
    exclude: '<path d="M4 4h10v6h-4v4H4zM14 10h6v10H10v-6h4z" fill="currentColor" fill-opacity=".22"/><rect x="10" y="10" width="4" height="4" stroke-dasharray="1.5 1.5"/>',
    group: '<rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke-dasharray="2.2 2.2"/><rect x="7" y="7" width="5.5" height="5.5"/><rect x="11.5" y="11.5" width="5.5" height="5.5"/>',
    ungroup: '<rect x="3.5" y="3.5" width="7.5" height="7.5"/><rect x="13" y="13" width="7.5" height="7.5"/>',
    combine: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
    breakApart: '<circle cx="7.5" cy="12" r="4.2"/><circle cx="16.5" cy="12" r="4.2"/><path d="M12 5v2M12 17v2"/>',
    /* convert to curves: open "C" with a node and its handle */
    curves: '<path d="M16.6 7.6A6.8 6.8 0 1018 15.4"/><path d="M17 5.6l3.6-1.8"/><rect x="15.2" y="4.1" width="3.2" height="3.2" fill="currentColor" stroke="none"/><circle cx="20.6" cy="3.8" r="1.1" fill="currentColor" stroke="none"/>',
    flipH: '<path d="M12 3v18" stroke-dasharray="2 2"/>' + f('M9.5 6.5L3.5 17.5h6z') + '<path d="M14.5 6.5l6 11h-6z"/>',
    flipV: '<path d="M3 12h18" stroke-dasharray="2 2"/>' + f('M6.5 9.5L17.5 3.5v6z') + '<path d="M6.5 14.5l11 6v-6z"/>',
    rotate: '<path d="M19 12a7 7 0 11-2.1-5"/><path d="M17.5 3.5v4h-4"/>',
    duplicate: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
    trash: '<path d="M4.5 6.5h15M9.5 6.5v-2a1 1 0 011-1h3a1 1 0 011 1v2M6.5 6.5l1 13a1 1 0 001 1h7a1 1 0 001-1l1-13M10 10v7M14 10v7"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="1"/><path d="M8.5 10.5V7.5a3.5 3.5 0 017 0v3"/><path d="M12 14v2.5"/>',
    unlock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="1"/><path d="M8.5 10.5V7.5a3.5 3.5 0 016.8-1.2"/><path d="M12 14v2.5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M4 4l16 16"/><path d="M9.9 6A8.6 8.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-2.7 3.4M14.1 17.9a8.4 8.4 0 01-2.1.6c-6 0-9.5-6.5-9.5-6.5a15.7 15.7 0 013.6-4.1"/>',
    layers: '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 12.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5"/>',
    page: PAGE,
    grid: '<rect x="4.5" y="4.5" width="15" height="15" rx=".6"/><path d="M4.5 9.5h15M4.5 14.5h15M9.5 4.5v15M14.5 4.5v15"/>',
    /* snap: horseshoe magnet, red pole on the right */
    magnet: '<path d="M4.5 20V11a7.5 7.5 0 0115 0v9h-3.6v-9a3.9 3.9 0 00-7.8 0v9z"/>' + f('M4.5 16.5h3.6V20H4.5z') + f('M15.9 16.5h3.6V20h-3.6z', RED),
    pencil: '<path d="M4 20l1.4-4.6L16.3 4.5a1.8 1.8 0 012.6 0l.6.6a1.8 1.8 0 010 2.6L8.6 18.6z"/><path d="M14.5 6.3l3.2 3.2"/>',
    link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    unlink: '<path d="M15.5 12.5l3.2-3.2a4 4 0 00-5.7-5.7l-1.4 1.4M8.5 11.5l-3.2 3.2a4 4 0 005.7 5.7l1.4-1.4"/><path d="M4 4l3 3M20 20l-3-3"/>',
    multi: ARROW(5, 3.5) + '<path d="M17.5 14v6.5M14.25 17.25h6.5"/>',
    toFront: '<rect x="9" y="9" width="11" height="11" fill="currentColor" fill-opacity=".3"/><path d="M15 5V4H4v11h1"/>',
    toBack: '<rect x="4" y="4" width="11" height="11" fill="currentColor" fill-opacity=".3"/><path d="M9 19v1h11V9h-1"/>',
    alignL: '<path d="M4 3v18"/><rect x="7" y="6" width="11" height="4"/><rect x="7" y="14" width="7" height="4"/>',
    alignCH: '<path d="M12 3v18"/><rect x="6" y="6" width="12" height="4"/><rect x="8" y="14" width="8" height="4"/>',
    alignR: '<path d="M20 3v18"/><rect x="6" y="6" width="11" height="4"/><rect x="10" y="14" width="7" height="4"/>',
    alignT: '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="11"/><rect x="14" y="7" width="4" height="7"/>',
    alignCV: '<path d="M3 12h18"/><rect x="6" y="6" width="4" height="12"/><rect x="14" y="8" width="4" height="8"/>',
    alignB: '<path d="M3 20h18"/><rect x="6" y="6" width="4" height="11"/><rect x="14" y="10" width="4" height="7"/>',
    distH: '<path d="M4 3v18M20 3v18"/><rect x="9.5" y="7" width="5" height="10"/>',
    distV: '<path d="M3 4h18M3 20h18"/><rect x="7" y="9.5" width="10" height="5"/>',
    /* ----- file ----- */
    /* import / export: open tray with an arrow going in / coming out */
    import: TRAY + '<path d="M12 3.5v11M8.5 11l3.5 3.5 3.5-3.5"/>',
    export: TRAY + '<path d="M12 14.5v-11M8.5 7L12 3.5 15.5 7"/>',
    /* "file" is the New document glyph: page with the green corner badge */
    file: PAGE_B + badge(),
    save: FLOPPY,
    image: '<rect x="3.5" y="5" width="17" height="14" rx="1"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/>',
    shadow: '<rect x="4" y="4" width="12" height="12" rx=".6"/>' + f('M16.8 7.5h3.4v12.7H7.5v-3.4h9.3z', 'currentColor" fill-opacity=".55'),
    stepRepeat: '<rect x="3.5" y="3.5" width="7" height="7"/><rect x="8.5" y="8.5" width="7" height="7"/><rect x="13.5" y="13.5" width="7" height="7"/>',
    kind_path: '<path d="M4 18C8 5 16 19 20 6"/>',
    kind_closed: '<path d="M6 17c-2-4 0-10 6-10s9 4 7 8-11 6-13 2z"/>',
    kind_group: '<rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke-dasharray="2.2 2.2"/><rect x="8" y="8" width="8" height="8"/>',
    kind_image: '<rect x="3.5" y="5" width="17" height="14" rx="1"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/>',
    kind_compound: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
    /* blend: two orange objects with the in-between steps */
    blend: '<path d="M7.5 7.5l9 9"/>' + '<circle cx="6.5" cy="6.5" r="3.2" fill="' + ORG + '" stroke="none"/><circle cx="12" cy="12" r="2.3" fill="' + ORG + '" fill-opacity=".75" stroke="none"/><circle cx="17.5" cy="17.5" r="3.2" fill="' + ORG + '" stroke="none"/><circle cx="6.5" cy="6.5" r="1.1" fill="' + RED + '" stroke="none"/><circle cx="17.5" cy="17.5" r="1.1" fill="' + RED + '" stroke="none"/>',
    contour: '<rect x="3" y="3" width="18" height="18" rx="4.5"/><rect x="6.8" y="6.8" width="10.4" height="10.4" rx="2.6"/><rect x="10.3" y="10.3" width="3.4" height="3.4" rx=".8" fill="currentColor" stroke="none"/>',
    envelope: '<path d="M4 7c5-3.5 11-3.5 16 0v10c-5 3.5-11 3.5-16 0z"/><rect x="10.6" y="3" width="2.8" height="2.8" fill="currentColor" stroke="none"/><rect x="10.6" y="18.2" width="2.8" height="2.8" fill="currentColor" stroke="none"/><rect x="2.6" y="10.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/><rect x="18.6" y="10.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/>',
    perspective: '<path d="M7.5 5h9l4 14h-17z"/><path d="M12 5v14M5.5 12h13" stroke-dasharray="2 2"/>'
  };
  P.extrude = '<path d="M3.5 9.5h11v11h-11z" fill="currentColor" fill-opacity=".22"/><path d="M3.5 9.5l5-5.5h11.5v11.5l-5.5 5M14.5 9.5L20 4"/>';
  P.lens = '<rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M5 17.5l4-4 3 2.5"/><circle cx="14.5" cy="14.5" r="6.5"/>';
  P.powerclip = '<path d="M12 2.8l9.2 9.2-9.2 9.2L2.8 12z"/><circle cx="12" cy="9.6" r="1.7"/><path d="M7.2 14.6l3.2-2.7 2.3 1.8 1.8-1.4 2.4 2.3"/>';
  P.textpath = '<path d="M3.5 20C6.5 13 17.5 13 20.5 20" stroke-dasharray="2.2 2.2"/><path d="M6.5 4.5h11M12 4.5v10"/>';
  P.paragraph = '<rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke-dasharray="2.2 2.2"/><path d="M7 8h10M7 11.3h10M7 14.6h10M7 17.9h6"/>';
  P.table = '<rect x="3.5" y="4.5" width="17" height="15" rx=".6"/><path d="M3.5 9.5h17M3.5 14.5h17M9.2 4.5v15M14.8 4.5v15"/>';
  P.alignJ = '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>';
  /* open: folder with its front flap line */
  P.open = '<path d="M3.5 6.5a1 1 0 011-1h4.6l2 2h8.4a1 1 0 011 1v10a1 1 0 01-1 1h-15a1 1 0 01-1-1z"/><path d="M3.5 10.5h17"/>';
  /* publish to PDF: page with green corner and a light "PDF" band */
  P.pdf = PAGE_B + badge() + f('M3 12h12.5v6.5H3z') +
    '<path d="M4.7 17V13.5h1.2a1 1 0 010 2H4.7M8.4 17v-3.5h.9a1.75 1.75 0 010 3.5zM12.2 17v-3.5h2.2M12.2 15.2h1.8" stroke-width="1" ' + KO + '/>';
  P.ruler = '<path d="M3.5 15.5L15.5 3.5l5 5-12 12z"/><path d="M7 12l2 2M9.5 9.5l1.5 1.5M12 7l2 2M14.5 4.5L16 6"/>';
  /* guidelines: a page crossed by a horizontal and a vertical guide (blue) */
  P.guides = '<rect x="5.5" y="5.5" width="13" height="13" rx=".6"/><path d="M2.5 10h19M14 2.5v19" stroke="' + BLU + '"/>' + '<rect x="12.6" y="2" width="2.8" height="2.8" fill="' + BLU + '" stroke="none"/>';
  P.gear = gear(12, 12, 8.6, 6.3, 8) + '<circle cx="12" cy="12" r="2.6"/>';
  P.chevFirst = '<path d="M16 6l-6 6 6 6M7 6v12"/>';
  P.chevLast = '<path d="M8 6l6 6-6 6M17 6v12"/>';
  /* parallel dimension: diagonal measure line with end ticks and arrowheads */
  P.dimParallel = '<path d="M6 18L18 6"/><path d="M3.5 15.5l5 5M15.5 3.5l5 5"/>' + f('M6 18l1.2-4 2.8 2.8zM18 6l-1.2 4-2.8-2.8z');
  P.dimHV = '<path d="M4 9h16"/><path d="M4 9l4-2.2v4.4zM20 9l-4-2.2v4.4z" fill="currentColor" stroke="none"/><path d="M4 5v15M20 5v15"/><rect x="7" y="13" width="10" height="6" rx="1" stroke-dasharray="2 2"/>';
  P.dimAngular = '<path d="M4 20h16M4 20L15 5"/><path d="M12.5 20a8.5 8.5 0 00-3.5-6.9"/><path d="M12.5 20l-1.8-3.4 3.4.3zM9 13.1l3.7.6-1.9 2.6z" fill="currentColor" stroke="none"/>';
  P.dimSegment = '<path d="M3 18c4-9 9-12 18-12"/><circle cx="3" cy="18" r="1.6" fill="currentColor"/><circle cx="21" cy="6" r="1.6" fill="currentColor"/><path d="M6 21L21 10" stroke-dasharray="2 2"/>';
  P.dimCallout = '<path d="M4 20l7-8h9"/><circle cx="4" cy="20" r="1.6" fill="currentColor"/><path d="M12 8h8M12 5h6" />';
  /* connectors: two small boxes joined, line ends on filled nodes */
  P.connStraight = '<rect x="2.5" y="3.5" width="6" height="5" rx=".6"/><rect x="15.5" y="15.5" width="6" height="5" rx=".6"/><path d="M8.5 8.5l7 7"/>';
  P.connRight = '<rect x="2.5" y="3.5" width="6" height="5" rx=".6"/><rect x="15.5" y="15.5" width="6" height="5" rx=".6"/><path d="M8.5 6H12v12h3.5"/>';
  P.connRound = '<rect x="2.5" y="3.5" width="6" height="5" rx=".6"/><rect x="15.5" y="15.5" width="6" height="5" rx=".6"/><path d="M8.5 6H9a3 3 0 013 3v6a3 3 0 003 3h.5"/>';
  P.bitmap = '<rect x="3.5" y="3.5" width="17" height="17" rx=".6"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/><rect x="9.2" y="9.2" width="5.6" height="5.6" fill="currentColor" stroke="none" opacity=".45"/>';
  P.glyph = '<path d="M7 19l5-14 5 14M8.8 14h6.4"/><path d="M17.5 4.5l2 2M19.5 4.5l-2 2" stroke-width="1.3"/>';
  P.search = '<circle cx="10" cy="10" r="6"/><path d="M14.4 14.4l5.6 5.6" stroke-width="2.2"/>';
  P.preview = '<rect x="3" y="5" width="18" height="13" rx="1"/><path d="M8 21h8M12 18v3"/><path d="M9 11.5l2 2 4-4"/>';
  P.sorter = '<rect x="3.5" y="3.5" width="7" height="7" rx=".6"/><rect x="13.5" y="3.5" width="7" height="7" rx=".6"/><rect x="3.5" y="13.5" width="7" height="7" rx=".6"/><rect x="13.5" y="13.5" width="7" height="7" rx=".6"/>';
  /* interactive fill: tilted paint bucket with red paint and a drop */
  P.fillTool = bucket(RED);
  P.meshTool = '<rect x="3.5" y="3.5" width="17" height="17" rx=".6"/><path d="M3.5 9.5c5 1 12-1 17 0M3.5 15c5 1 12-1 17 0M9.5 3.5c1 5-1 12 0 17M15 3.5c1 5-1 12 0 17"/>' +
    '<rect x="8.3" y="8.5" width="2.6" height="2.6" fill="' + BLU + '" stroke="none"/><rect x="13.8" y="13.9" width="2.6" height="2.6" fill="' + BLU + '" stroke="none"/>';
  /* transparency: checkerboard square */
  P.transpTool = checker(4, 4, 3.2, 5);
  /* smart fill: two overlapping outlines, the shared area painted, small bucket drop */
  P.smartFill = '<rect x="3.5" y="5.5" width="10" height="10" rx=".6"/><circle cx="14" cy="13" r="6"/>' + f('M8 9.5a6 6 0 015.5 2.5v3.5H8.3A6 6 0 018 9.5z', RED);
  P.cropTool = '<path d="M7 3v14h14"/><path d="M3 7h14v14"/>';
  P.knifeTool = '<path d="M4 20L16.5 7.5l2-.5.5 2L6.5 21.5z"/><path d="M14 10l2 2"/><path d="M3 13l3-3M8 21l3-3" stroke-dasharray="1.5 1.5"/>';
  P.eraserTool = '<path d="M14.5 4.5l5 5L10 19H5.5l-2-2z"/><path d="M9.5 9.5l5 5"/><path d="M10 19h10"/>';
  P.smoothTool = '<path d="M3 15c2-3 3 2 5-1s3 2 5-1 3 2 5-1"/><path d="M3 20c4-3 14-3 18 0" stroke-dasharray="2 2"/><circle cx="17" cy="7" r="3.5"/>';
  /* smear / shaping: a filled swoosh */
  P.smearTool = f('M15.6 3.5c-3.2 1.1-4.7 3.6-3.1 5.7 1.4 1.9 1.3 4-1.2 6.4-2 1.9-4.6 3-7.3 4 3.8.6 8.3-.6 10.8-3.6 2.2-2.6 2.2-5.5.7-7.6-1.2-1.6-1-3.6.1-4.9z');
  P.twirlTool = '<path d="M12 12c1.4 0 2-1.6 1-2.6-1.5-1.5-4.2-.4-4.2 1.8 0 3 3.5 4.6 6 3.1 3.4-2 3-7.3-.6-9-4.2-2-9.2 1.2-9.2 5.8 0 5 4.6 8.4 9.4 7.4"/>';
  P.attractTool = '<circle cx="12" cy="12" r="8.5" stroke-dasharray="2 2"/><path d="M12 4.5v4M12 19.5v-4M4.5 12h4M19.5 12h-4"/><path d="M10.3 7.2L12 9l1.7-1.8M10.3 16.8L12 15l1.7 1.8M7.2 10.3L9 12l-1.8 1.7M16.8 10.3L15 12l1.8 1.7"/>';
  P.repelTool = '<circle cx="12" cy="12" r="8.5" stroke-dasharray="2 2"/><path d="M12 9.5v-6M12 14.5v6M9.5 12h-6M14.5 12h6"/><path d="M10.3 5.2L12 3.5l1.7 1.7M10.3 18.8L12 20.5l1.7-1.7M5.2 10.3L3.5 12l1.7 1.7M18.8 10.3L20.5 12l-1.7 1.7"/>';
  P.roughenTool = '<path d="M3 16l2-4 2 5 2-6 2 6 2-5 2 5 2-6 2 5 2-3"/>';
  P.bsplineTool = '<path d="M4 18C7 6 17 6 20 18"/><path d="M4 18L8 6h8l4 12" stroke-dasharray="2 2"/><rect x="6.6" y="4.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/><rect x="14.6" y="4.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/>';
  P.polylineTool = '<path d="M3.5 18L8 7l5 9 2.5-4c1.5-2.5 3-3.5 5-3"/><rect x="6.6" y="5.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/><rect x="11.6" y="14.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/>';
  P.curve3Tool = '<path d="M4 18C7 8 17 8 20 18"/><rect x="2.6" y="16.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/><rect x="18.6" y="16.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/><rect x="10.6" y="9.1" width="2.8" height="2.8"/>';
  P.lassoTool = f('M7 3.5l9 5.6-4 1.1-1.8 4z') + '<path d="M12 16c-5 3-10 1-9.5-3S10 7 15 8s6.5 4.5 3.5 7.5c-1.6 1.6-4 2-6.5 1z" stroke-dasharray="2 2"/>';
  P.rect3Tool = '<path d="M3 15L14 4l7 7-11 11z"/><rect x="1.6" y="13.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/><rect x="12.6" y="2.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/><rect x="19.6" y="9.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/>';
  P.ellipse3Tool = '<ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-35 12 12)"/><rect x="3.2" y="15.8" width="2.8" height="2.8" fill="currentColor" stroke="none"/><rect x="18" y="5.4" width="2.8" height="2.8" fill="currentColor" stroke="none"/><rect x="13.8" y="15.1" width="2.8" height="2.8" fill="currentColor" stroke="none"/>';
  P.cstarTool = '<path d="M12 2.5L17.6 20 3 9.2h18L6.4 20z"/>';
  P.graphTool = '<rect x="3.5" y="3.5" width="17" height="17"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>';
  P.perfectTool = '<path d="M4 12a4.5 4.5 0 019 0c0 3.5-4.5 6-4.5 6S4 15.5 4 12z"/><path d="M13 6h7l-3.5 6z"/><path d="M14 15h7v6h-7z"/>';
  P.smartDraw = '<path d="M5 18c-2-4 0-11 7-11s9 5 7 9" stroke-dasharray="2 2"/><rect x="5" y="6" width="14" height="12" rx=".6"/><path d="M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor" stroke="none"/>';
  P.sketchTool = '<path d="M3.5 17c3-5 6-9 9-9s2.5 5 5.5 5 2.5-3 2.5-3"/><path d="M4 18.5c3-5 6.5-9 9.5-8.5s2 4.5 5 4" opacity=".5"/>';
  P.liveSketch = '<path d="M3.5 16c3-6 7-9 10-7s2 6 6 5"/><path d="M3 18c4-6 7.5-8 10.5-6" stroke-dasharray="1.5 2" opacity=".6"/><path d="M15 5l4 4" />';
  P.varOutline = '<path d="M3 16c3-6 5-8 8-8 4 0 5 7 10 3" stroke-width="1"/><path d="M3 18c2-2 3-2 4-1 2 2 3-6 6-6 2 0 3 5 8 1" fill="currentColor" fill-opacity=".25"/>';
  P.virtualDel = '<path d="M3 12h18M12 3v18"/><path d="M14 6l4 4M18 6l-4 4" stroke="' + RED + '"/>';
  P.attrEyedropper = EYEDROP + '<rect x="15" y="15" width="6" height="5.5" rx=".6"/>' + f('M16.2 16.2h3.6v3.1h-3.6z', ORG);
  P.cornerTool = '<path d="M4 20V11a7 7 0 017-7h9"/><path d="M4 20V4h16" stroke-dasharray="2 2" opacity=".5"/>';
  P.kind_perfect = P.perfectTool;
  P.kind_cstar = P.cstarTool;
  P.kind_varline = P.varOutline;
  P.kind_bspline = P.bsplineTool;
  P.kind_fillfx = '<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/>';
  P.kind_mesh = P.meshTool;
  P.kind_dimension = P.dimParallel; P.kind_connector = P.connRight;
  P.kind_textpath = P.textpath; P.kind_paragraph = P.paragraph; P.kind_table = P.table;
  P.kind_blend = P.blend; P.kind_contour = P.contour; P.kind_envelope = P.envelope; P.kind_perspective = P.perspective;
  P.kind_extrude = P.extrude; P.kind_lens = P.lens; P.kind_powerclip = P.powerclip;
  P.kind_rect = P.rect; P.kind_ellipse = P.ellipse; P.kind_polygon = P.polygon; P.kind_star = P.star; P.kind_spiral = P.spiral; P.kind_text = P.text;

  /* v9: shadows, distortion, outlines, bitmap effects */
  /* drop shadow tool: object outline with the shadow offset to the lower right */
  P.shadowTool = '<rect x="4" y="4" width="12" height="12" rx=".6"/>' + f('M16.8 7.5h3.4v12.7H7.5v-3.4h9.3z', 'currentColor" fill-opacity=".55');
  P.innerShadow = '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4.8 19V5.2c0-.2.2-.4.4-.4H19" stroke-width="3.2" stroke-opacity=".35"/>';
  P.blockShadow = '<path d="M4 4h10v10H4z"/><path d="M14 4l6 6v10H10l-6-6h10z" fill="currentColor" fill-opacity=".3" stroke="none"/>';
  P.distort = '<path d="M12 3l2.2 5.6L20 7l-3.4 5L20 17l-5.8-1.6L12 21l-2.2-5.6L4 17l3.4-5L4 7l5.8 1.6z"/>';
  P.pshadow = '<path d="M7 3.5h6v11H7z"/><path d="M7 14.5h6l7 5H14z" fill="currentColor" fill-opacity=".3" stroke="none"/>';
  P.arrowLine = '<path d="M4 18L18 6"/><path d="M11.5 6H18v6.5" fill="none"/>';
  P.calligraphy = '<path d="M4 18c3-9 6-12 8-10s-1 7 2 8 4-6 6-9" stroke-width="2.6"/>';
  P.bmpfx = '<rect x="3.5" y="5" width="17" height="14" rx=".6"/><path d="M6 16l4-4.5 3 3 2-2 3 3.5"/><path d="M17 3.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" stroke="none"/>';
  P.pages = '<path d="M9 3.5h8.5a1 1 0 011 1v12a1 1 0 01-1 1H9a1 1 0 01-1-1v-12a1 1 0 011-1z"/><path d="M5.5 7v12.5a1 1 0 001 1H15"/>';
  P.comment = '<path d="M4 5h16v11H11l-4 4v-4H4z"/><path d="M8 9h8M8 12h5"/>';
  P.symbol = '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>';
  P.styles = '<path d="M5 5h14v4H5zM5 11h9v4H5zM5 17h11"/>';
  /* print: rounded printer with paper on top and in the output tray */
  P.print = '<path d="M7.5 9V4.5a1 1 0 011-1h7a1 1 0 011 1V9"/><path d="M7.5 17H5.5a1.5 1.5 0 01-1.5-1.5v-5A1.5 1.5 0 015.5 9h13a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-1.5 1.5h-2"/><path d="M7.5 14h9v6.5h-9z"/><circle cx="17" cy="11.5" r=".7" fill="currentColor" stroke="none"/>';
  /* cut: page with small scissors at its lower right */
  P.cut = '<path d="M12 20.5H5.5a1 1 0 01-1-1v-15a1 1 0 011-1h9a1 1 0 011 1v6"/><circle cx="14" cy="19" r="1.7"/><circle cx="19.5" cy="19" r="1.7"/><path d="M15 17.5l3.8-6M18.5 17.5l-3.8-6"/>';
  P.copy = '<rect x="5" y="7" width="11" height="13.5" rx="1"/><path d="M8.5 7V4.5a1 1 0 011-1h9a1 1 0 011 1V16a1 1 0 01-1 1H16"/>';
  P.paste = '<path d="M8.5 5H6a1 1 0 00-1 1v13.5a1 1 0 001 1h4.5M15.5 5H18a1 1 0 011 1v3.5"/><rect x="8.5" y="3" width="7" height="3.5" rx=".8"/><rect x="11.5" y="11" width="8.5" height="10" rx=".8"/>';
  /* full-screen preview: filled page with the corner arrows around it */
  P.fullscreen = '<path d="M3.5 8.5v-5h5M15.5 3.5h5v5M20.5 15.5v5h-5M8.5 20.5h-5v-5"/>' + f('M7.5 7.5h9v9h-9z');
  P.snapOff = P.magnet + '<path d="M3.5 3.5l17 17" stroke-width="2"/>';
  /* outline pen (Anahat) — upright fountain-pen nib, as on the outline docker tab */
  P.outlinePen = '<path d="M12 3l5 7.6-2.1 6.4H9.1L7 10.6z"/><path d="M12 3v6.8"/><circle cx="12" cy="11.4" r="1.4"/><path d="M8.5 20.5h7" stroke-width="2"/>';
  P.hints = '<circle cx="12" cy="10" r="6"/><path d="M9.5 16.5h5M10 20h4M12 7v3.5M12 13v.3"/>';
  P.welcome = '<path d="M4 11L12 4l8 7"/><path d="M6 9.5V20h4.5v-5.5h3V20H18V9.5"/>';
  P.code = '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>';
  P.ecCut = '<path d="M5 8.5a3.5 3.5 0 013.5-3.5h7A3.5 3.5 0 0119 8.5v7a3.5 3.5 0 01-3.5 3.5h-7A3.5 3.5 0 015 15.5z" stroke-dasharray="3 2"/><path d="M9 12h6"/>';
  P.ecMarks = '<rect x="3" y="3" width="4" height="4" fill="currentColor"/><rect x="17" y="3" width="4" height="4" fill="currentColor"/><rect x="3" y="17" width="4" height="4" fill="currentColor"/><rect x="17" y="17" width="4" height="4" fill="currentColor"/><rect x="8.5" y="8.5" width="7" height="7"/>';
  P.ecImpose = '<rect x="3.5" y="3.5" width="7" height="7"/><rect x="13.5" y="3.5" width="7" height="7"/><rect x="3.5" y="13.5" width="7" height="7"/><rect x="13.5" y="13.5" width="7" height="7"/>';
  P.ecNest = '<rect x="3.5" y="3.5" width="17" height="17"/><path d="M3.5 11h9v9.5M12.5 3.5V11M12.5 15h8"/>';
  P.ecWeed = '<rect x="3.5" y="3.5" width="17" height="17" stroke-dasharray="2.5 2"/><circle cx="9" cy="9" r="2.5"/><rect x="13" y="13" width="5" height="5"/><path d="M12 3.5v17M3.5 12h17" stroke-width=".9"/>';
  P.kind_pshadow = P.pshadow; P.kind_innerShadow = P.innerShadow; P.kind_blockShadow = P.blockShadow; P.kind_distort = P.distort; P.kind_transpfx = P.transpTool || P.lens;

  /* ---------- added for the desktop-suite look (see corel-ref/icons-added.md) ---------- */
  /* file menu / standard toolbar */
  P.newDoc = P.file;
  P.doc = PAGE;
  P.template = PAGE_B + badge() + '<path d="M8 9h5M8 12h8M8 15h8M8 18h5"/>';
  P.saveAs = '<path d="M13 4.5H5.5a1 1 0 00-1 1v13a1 1 0 001 1h13a1 1 0 001-1v-8"/><path d="M8.5 4.5v4h4.5M7.5 19.5v-5.5h9v5.5"/>' + badge();
  P.saveTemplate = PAGE_B + '<path d="M8 9h5M8 12h8M8 15h5"/>' + '<rect x="14.6" y="2.6" width="6.8" height="6.8" rx="1"/>' + '<path d="M16.4 2.6v2.4h3.2V2.6"/>';
  P.cloudOpen = CLOUD + '<path d="M12 10v10M9 17l3 3 3-3"/>';
  P.cloudSave = CLOUD + '<path d="M12 20V10M9 13l3-3 3 3"/>';
  P.closeDoc = '<path d="M13.5 4.5H4.5a1 1 0 00-1 1v13a1 1 0 001 1h15a1 1 0 001-1v-8"/><path d="M3.5 8.5h10"/><path d="M16.2 2.8l4.6 4.6M20.8 2.8l-4.6 4.6" stroke="' + RED + '" stroke-width="1.8"/>';
  P.closeAll = '<path d="M11.5 7.5H3.5v12h14v-6"/><path d="M6.5 7.5v-3h8M3.5 10.5h8"/><path d="M15.2 2.8l4.6 4.6M19.8 2.8l-4.6 4.6" stroke="' + RED + '" stroke-width="1.8"/>';
  P.printPreview = '<path d="M11.5 20.5h-5a1 1 0 01-1-1v-15a1 1 0 011-1h8l4 4v3"/><circle cx="15.5" cy="15.5" r="3.3"/><path d="M17.9 17.9l2.6 2.6" stroke-width="2"/>';
  P.docProps = PAGE + '<path d="M8.5 11h7M8.5 14h7M8.5 17h4"/>';
  P.quit = '<path d="M7.6 6.6a7.2 7.2 0 108.8 0"/><path d="M12 3.5v8"/>';
  P.addPage = PAGE_B + badge() + '<path d="M18 3.9v4.2M15.9 6h4.2" stroke-width="1.4" ' + KO + '/>';
  P.home = P.welcome;
  P.rulers = '<path d="M3.5 3.5h17v5H8.5v12h-5z"/><path d="M11 3.5v2.5M14 3.5v1.6M17 3.5v2.5M3.5 11h2.5M3.5 14h1.6M3.5 17h2.5"/>';
  P.guidelines = P.guides;
  P.gridPage = P.grid;
  P.options = P.gear;
  /* property bar */
  P.portrait = '<path d="M7 3.5h7l3.5 3.5v12.5a1 1 0 01-1 1H7a1 1 0 01-1-1v-15a1 1 0 011-1z"/><path d="M14 3.5V7h3.5"/>';
  P.landscape = '<path d="M4.5 6h11.5L20 9.5V17a1 1 0 01-1 1H4.5a1 1 0 01-1-1V7a1 1 0 011-1z"/><path d="M16 6v3.5h4"/>';
  P.allPages = '<rect x="3.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="9.5" y="3.5" width="11" height="11" rx="1.5"/>';
  P.currentPage = '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/><path d="M9 12h6"/>';
  P.nudge = '<path d="M12 3v18M3 12h18"/><path d="M9.5 5.5L12 3l2.5 2.5M9.5 18.5L12 21l2.5-2.5M5.5 9.5L3 12l2.5 2.5M18.5 9.5L21 12l-2.5 2.5"/>';
  P.dupDistance = '<rect x="3.5" y="3.5" width="9" height="9" rx=".6" stroke-dasharray="2 1.6"/><rect x="11.5" y="11.5" width="9" height="9" rx=".6"/>';
  P.pageFrame = '<path d="M3.5 8V3.5H8M16 3.5h4.5V8M20.5 16v4.5H16M8 20.5H3.5V16"/><rect x="7" y="7" width="10" height="10" stroke-dasharray="2 1.6"/>';
  P.objWidth = '<path d="M3.5 12h17M6.5 9l-3 3 3 3M17.5 9l3 3-3 3"/>';
  P.objHeight = '<path d="M12 3.5v17M9 6.5l3-3 3 3M9 17.5l3 3 3-3"/>';
  P.pageWidth = '<path d="M5.5 4.5h13M5.5 2.5v4M18.5 2.5v4"/><rect x="5.5" y="9" width="13" height="11.5" rx=".6"/>';
  P.pageHeight = '<path d="M4.5 5.5v13M2.5 5.5h4M2.5 18.5h4"/><rect x="9" y="5.5" width="11.5" height="13" rx=".6"/>';
  P.refPoint = '<rect x="3.5" y="3.5" width="4" height="4"/><rect x="10" y="3.5" width="4" height="4"/><rect x="16.5" y="3.5" width="4" height="4"/><rect x="3.5" y="10" width="4" height="4"/><rect x="10" y="10" width="4" height="4" fill="currentColor"/><rect x="16.5" y="10" width="4" height="4"/><rect x="3.5" y="16.5" width="4" height="4"/><rect x="10" y="16.5" width="4" height="4"/><rect x="16.5" y="16.5" width="4" height="4"/>';
  P.lockRatio = '<rect x="7" y="11.5" width="10" height="8" rx="1"/><path d="M9.5 11.5V8.5a2.5 2.5 0 015-0"/>';
  P.ellipseFull = P.ellipse;
  P.pie = '<path d="M12 12V4.2A7.8 7.8 0 1019.8 12z"/>';
  P.arc = '<path d="M12 4.2A7.8 7.8 0 1019.8 12"/>';
  P.arcDir = '<path d="M17.5 6.5A7.8 7.8 0 1019.8 12"/>' + f('M19.6 4.2l.4 4.4-4.4-.4z');
  P.mirrorH = P.flipH;
  P.mirrorV = P.flipV;
  P.nib = P.outlinePen;
  P.outlineWidth = P.outlinePen;
  P.textWrap = '<rect x="8.5" y="8.5" width="7" height="7" rx=".6"/><path d="M3.5 4.5h17M3.5 8.5h3M17.5 8.5h3M3.5 12h3M17.5 12h3M3.5 15.5h3M17.5 15.5h3M3.5 19.5h17"/>';
  P.wrapText = P.textWrap;
  P.toFrontOfLayer = P.toFront;
  P.toBackOfLayer = P.toBack;
  /* docker section tabs (Özellikler) */
  P.fillBucket = bucket(ORG);
  P.transparency = P.transpTool;
  P.fx = '<path d="M4.5 20c1.4 0 2-.8 2.3-2.2L8.8 7.6C9.1 6.1 9.8 5 11.5 5M6 10.5h5"/><path d="M12.5 11.5l6.5 8.5M19 11.5l-6.5 8.5"/>';
  P.effects = P.fx;
  P.circleTab = '<circle cx="12" cy="12" r="7.8"/>';
  P.artisticMedia = P.brush;
  P.summary = '<rect x="3.5" y="5" width="15" height="14" rx=".6"/><path d="M6 16l3.5-4 2.5 2.5 2-2 3 3.5"/><circle cx="9" cy="9" r="1.3"/><path d="M18.5 3v5M16 5.5h5"/>';
  P.frameTab = '<path d="M4.5 18.5V8a3.5 3.5 0 013.5-3.5h8A3.5 3.5 0 0119.5 8v10.5z"/>';
  P.pageTab = '<path d="M5.5 4.5h9l4 4v11h-13z"/><path d="M14.5 4.5v4h4"/>';
  /* toolbox extras */
  P.pick = P.select;
  P.shapeTool = P.node;
  P.crop = P.cropTool;
  P.freehandTool = P.freehand;
  P.artisticTool = P.brush;
  P.dimension = P.dimParallel;
  P.connector = P.connStraight;
  P.blendTool = P.blend;
  P.dropShadow = P.shadowTool;
  P.interactiveFill = P.fillTool;
  P.smartFillTool = P.smartFill;
  P.colorEyedropper = P.eyedropper;
  P.swoosh = P.smearTool;
  P.customize = P.plus;
  /* object menu */
  P.clearTransform = '<rect x="4" y="8" width="11" height="11" rx=".6"/><path d="M8 8V5h11v11h-4"/>' + '<circle cx="19" cy="5" r="2.6" fill="' + RED + '" stroke="none"/>';
  P.toBitmap = P.bitmap;
  P.outlineToObject = '<rect x="4.5" y="4.5" width="15" height="15" rx=".6"/><rect x="7.5" y="7.5" width="9" height="9" rx=".6"/>' + f('M3 3h3v3H3zM18 3h3v3h-3zM3 18h3v3H3zM18 18h3v3h-3z');
  P.check = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
  P.cloud = CLOUD.replace('H16', 'H8');

  window.VPIcon = function (name, cls) {
    const body = P[name] || P.plus;
    return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" data-icon="' + String(name).replace(/"/g, '') + '">' + body + '</svg>';
  };
  window.VPIcon.has = (name) => !!P[name];
  window.VPIcon.names = () => Object.keys(P);
})();
