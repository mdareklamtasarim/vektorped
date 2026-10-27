/* VektörPad icon set: 24x24 line icons drawn for this app. */
(function () {
  const P = {
    select: '<path d="M6 3.5l11.5 7.2-5.2 1.4L9.8 17z" fill="currentColor" stroke="none"/><path d="M12.3 12.1l3.6 6.2"/>',
    node: '<path d="M5 19C7 9 13 5 19 5"/><rect x="3" y="17" width="4" height="4" fill="currentColor"/><rect x="17" y="3" width="4" height="4"/><path d="M11 9.5l4-3.4"/><circle cx="10.5" cy="10" r="1.6" fill="currentColor"/>',
    freehand: '<path d="M3.5 16.5c2.6-5.6 4.6-8.4 6.4-7.1 2 1.4-1.6 6.1.6 7.1 2.2 1 4-5.3 6.2-6.6 1.6-.9 2.6.6 3.8 1.9"/>',
    brush: '<path d="M18.5 3.5l2 2-8.7 8.7-2-2z"/><path d="M9.6 12.4c-2.4-.2-4 1.2-4.3 3.6-.2 1.6-1 2.6-2.3 3.2 3.4.8 7.4-.1 8-3.6"/>',
    pen: '<path d="M12 21l-5-8.5L12 3l5 9.5z"/><path d="M12 3v7.8"/><circle cx="12" cy="12.6" r="1.5"/><path d="M8.5 21h7"/>',
    line: '<path d="M5.5 18.5L18.5 5.5"/><circle cx="5" cy="19" r="1.8" fill="currentColor"/><circle cx="19" cy="5" r="1.8" fill="currentColor"/>',
    rect: '<rect x="4" y="6" width="16" height="12" rx="1.2"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
    polygon: '<path d="M12 3.6l8.2 6-3.1 9.7H6.9L3.8 9.6z"/>',
    star: '<path d="M12 3.4l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.2 6-.9z"/>',
    spiral: '<path d="M12.2 12.1c.1-.9 1.2-1.2 1.8-.6.9.8.4 2.4-.8 2.8-1.7.6-3.4-.8-3.4-2.6 0-2.4 2.4-4.2 4.8-3.6 3 .7 4.4 4.1 3.2 6.8-1.4 3.2-5.4 4.4-8.5 2.8"/>',
    text: '<path d="M5 6.5V4.5h14v2M12 4.5v15M9 19.5h6"/>',
    eyedropper: '<path d="M15.8 3.8a2.6 2.6 0 013.7 3.7l-2.6 2.6-3.7-3.7z"/><path d="M13.2 6.4L5.5 14.1l-.9 4.3 4.3-.9 7.7-7.7"/><path d="M12 7.6l3.9 3.9"/>',
    hand: '<path d="M8.2 12.6V6.6a1.4 1.4 0 012.8 0v5"/><path d="M11 11.4V5.2a1.4 1.4 0 012.8 0v6.2"/><path d="M13.8 11.4V6.6a1.4 1.4 0 012.8 0V14c0 3.9-2.4 6.5-5.8 6.5-2.4 0-3.8-1.2-5.2-3.2l-1.9-2.8a1.4 1.4 0 012.2-1.7l2.3 2.4"/>',
    zoom: '<circle cx="10.5" cy="10.5" r="6.2"/><path d="M15.2 15.2l5 5"/><path d="M8 10.5h5M10.5 8v5"/>',
    zoomIn: '<circle cx="10.5" cy="10.5" r="6.2"/><path d="M15.2 15.2l5 5M8 10.5h5M10.5 8v5"/>',
    zoomOut: '<circle cx="10.5" cy="10.5" r="6.2"/><path d="M15.2 15.2l5 5M8 10.5h5"/>',
    fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
    undo: '<path d="M9 5L4 10l5 5"/><path d="M4 10h10a5 5 0 010 10h-3"/>',
    redo: '<path d="M15 5l5 5-5 5"/><path d="M20 10H10a5 5 0 000 10h3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    panels: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M14.5 4.5v15M16.8 8h1.5M16.8 11h1.5"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 014.9.6c0 1.7-2.5 2.2-2.5 3.8"/><circle cx="12" cy="16.9" r=".6" fill="currentColor"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    chevDown: '<path d="M6 9.5l6 6 6-6"/>',
    chevUp: '<path d="M6 14.5l6-6 6 6"/>',
    chevLeft: '<path d="M14.5 6l-6 6 6 6"/>',
    chevRight: '<path d="M9.5 6l6 6-6 6"/>',
    weld: '<path d="M4 4h10v6h6v10H10v-6H4z" fill="currentColor" fill-opacity=".22"/>',
    trim: '<path d="M4 4h10v6h-4v4H4z" fill="currentColor" fill-opacity=".22"/><rect x="10" y="10" width="10" height="10" stroke-dasharray="2 2"/>',
    intersect: '<rect x="4" y="4" width="10" height="10" stroke-dasharray="2 2"/><rect x="10" y="10" width="10" height="10" stroke-dasharray="2 2"/><rect x="10" y="10" width="4" height="4" fill="currentColor" stroke="none"/>',
    exclude: '<path d="M4 4h10v6h-4v4H4zM14 10h6v10H10v-6h4z" fill="currentColor" fill-opacity=".22"/><rect x="10" y="10" width="4" height="4" stroke-dasharray="1.5 1.5"/>',
    group: '<rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke-dasharray="2.2 2.2"/><rect x="7" y="7" width="5.5" height="5.5"/><rect x="11.5" y="11.5" width="5.5" height="5.5"/>',
    ungroup: '<rect x="3.5" y="3.5" width="7.5" height="7.5"/><rect x="13" y="13" width="7.5" height="7.5"/>',
    combine: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
    breakApart: '<circle cx="7.5" cy="12" r="4.2"/><circle cx="16.5" cy="12" r="4.2"/><path d="M12 5v2M12 17v2"/>',
    curves: '<path d="M4.5 18.5C8 4.5 16 19.5 19.5 5.5"/><rect x="2.8" y="16.8" width="3.4" height="3.4" fill="currentColor"/><rect x="17.8" y="3.8" width="3.4" height="3.4" fill="currentColor"/>',
    flipH: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7L4 17h5zM15 7l5 10h-5z"/>',
    flipV: '<path d="M3 12h18" stroke-dasharray="2 2"/><path d="M7 9L17 4v5zM7 15l10 5v-5z"/>',
    rotate: '<path d="M19 12a7 7 0 11-2.1-5"/><path d="M17.5 3.5v4h-4"/>',
    duplicate: '<rect x="8" y="8" width="12" height="12" rx="1.2"/><path d="M16 8V5.2A1.2 1.2 0 0014.8 4H5.2A1.2 1.2 0 004 5.2v9.6A1.2 1.2 0 005.2 16H8"/>',
    trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 017.6-1.8"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M4 4l16 16"/><path d="M9.9 6A8.6 8.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-2.7 3.4M14.1 17.9a8.4 8.4 0 01-2.1.6c-6 0-9.5-6.5-9.5-6.5a15.7 15.7 0 013.6-4.1"/>',
    layers: '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 12.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5"/>',
    page: '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14.5 3v4.5H19"/>',
    grid: '<rect x="4" y="4" width="16" height="16"/><path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
    magnet: '<path d="M6 4v8a6 6 0 0012 0V4"/><path d="M6 4h3.5v8a2.5 2.5 0 005 0V4H18"/><path d="M6 7.5h3.5M14.5 7.5H18"/>',
    pencil: '<path d="M4 20l1.4-4.6L16.3 4.5a1.8 1.8 0 012.6 0l.6.6a1.8 1.8 0 010 2.6L8.6 18.6z"/><path d="M14.5 6.3l3.2 3.2"/>',
    link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    unlink: '<path d="M15.5 12.5l3.2-3.2a4 4 0 00-5.7-5.7l-1.4 1.4M8.5 11.5l-3.2 3.2a4 4 0 005.7 5.7l1.4-1.4"/><path d="M4 4l3 3M20 20l-3-3"/>',
    multi: '<path d="M5 3.5l9.5 6-4.3 1.1L8 14.6z" fill="currentColor" stroke="none"/><path d="M17 14v6M14 17h6"/>',
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
    export: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 13v6.5h14V13"/>',
    import: '<path d="M12 3.5V15M7.5 10.5L12 15l4.5-4.5"/><path d="M5 13v6.5h14V13"/>',
    file: '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14.5 3v4.5H19"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/>',
    shadow: '<rect x="4" y="4" width="12" height="12" rx="1"/><path d="M16 8h4v12H8v-4" fill="currentColor" fill-opacity=".25" stroke="none"/>',
    stepRepeat: '<rect x="3.5" y="3.5" width="7" height="7"/><rect x="8.5" y="8.5" width="7" height="7"/><rect x="13.5" y="13.5" width="7" height="7"/>',
    kind_path: '<path d="M4 18C8 5 16 19 20 6"/>',
    kind_closed: '<path d="M6 17c-2-4 0-10 6-10s9 4 7 8-11 6-13 2z"/>',
    kind_group: '<rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke-dasharray="2.2 2.2"/><rect x="8" y="8" width="8" height="8"/>',
    kind_image: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/>',
    kind_compound: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
    blend: '<circle cx="5" cy="12" r="2.4" fill="currentColor" stroke="none"/><circle cx="10.2" cy="12" r="3.2" opacity=".6"/><circle cx="16.6" cy="12" r="4.4"/>',
    contour: '<rect x="3" y="3" width="18" height="18" rx="4.5"/><rect x="6.8" y="6.8" width="10.4" height="10.4" rx="2.6"/><rect x="10.3" y="10.3" width="3.4" height="3.4" rx=".8" fill="currentColor" stroke="none"/>',
    envelope: '<path d="M4 7c5-3.5 11-3.5 16 0v10c-5 3.5-11 3.5-16 0z"/><circle cx="12" cy="4.4" r="1.5" fill="currentColor"/><circle cx="12" cy="19.6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.3" fill="currentColor"/><circle cx="20" cy="12" r="1.3" fill="currentColor"/>',
    perspective: '<path d="M7.5 5h9l4 14h-17z"/><path d="M12 5v14M5.5 12h13" stroke-dasharray="2 2"/>'
  };
  P.extrude = '<path d="M3.5 9.5h11v11h-11z" fill="currentColor" fill-opacity=".22"/><path d="M3.5 9.5l5-5.5h11.5v11.5l-5.5 5M14.5 9.5L20 4"/>';
  P.lens = '<rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M5 17.5l4-4 3 2.5"/><circle cx="14.5" cy="14.5" r="6.5"/>';
  P.powerclip = '<path d="M12 2.8l9.2 9.2-9.2 9.2L2.8 12z"/><circle cx="12" cy="9.6" r="1.7"/><path d="M7.2 14.6l3.2-2.7 2.3 1.8 1.8-1.4 2.4 2.3"/>';
  P.textpath = '<path d="M3.5 20C6.5 13 17.5 13 20.5 20" stroke-dasharray="2.2 2.2"/><path d="M6.5 4.5h11M12 4.5v10"/>';
  P.paragraph = '<rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke-dasharray="2.2 2.2"/><path d="M7 8h10M7 11.3h10M7 14.6h10M7 17.9h6"/>';
  P.table = '<rect x="3.5" y="4.5" width="17" height="15" rx="1"/><path d="M3.5 9.5h17M3.5 14.5h17M9.2 4.5v15M14.8 4.5v15"/>';
  P.alignJ = '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>';
  P.open = '<path d="M3.5 7.5V18a1.5 1.5 0 001.5 1.5h13.2a1.5 1.5 0 001.4-1l2-6.2a1 1 0 00-1-1.3H7.4a1.5 1.5 0 00-1.4 1L3.5 18"/><path d="M3.5 7.5V6A1.5 1.5 0 015 4.5h4l2 2h6A1.5 1.5 0 0118.5 8v3"/>';
  P.pdf = '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14.5 3v4.5H19"/><path d="M8.6 16.8v-4.6h1.5a1.3 1.3 0 010 2.6H8.6M12.6 16.8v-4.6h1a2.3 2.3 0 010 4.6zM16.4 16.8v-4.6h2M16.4 14.4h1.6" stroke-width="1.3"/>';
  P.ruler = '<path d="M3.5 15.5L15.5 3.5l5 5-12 12z"/><path d="M7 12l2 2M9.5 9.5l1.5 1.5M12 7l2 2M14.5 4.5L16 6"/>';
  P.guides = '<path d="M3 8h18M15 3v18" stroke-dasharray="3 2"/><rect x="5" y="11" width="7" height="7" rx="1"/>';
  P.gear = '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.3"/>';
  P.chevFirst = '<path d="M16 6l-6 6 6 6M7 6v12"/>';
  P.chevLast = '<path d="M8 6l6 6-6 6M17 6v12"/>';
  P.dimParallel = '<path d="M4 17L17 4" /><path d="M4 17l4.5-1.2L5.2 12.5zM17 4l-1.2 4.5-3.3-3.3z" fill="currentColor" stroke="none"/><path d="M7 20l-3-3M20 7l-3-3"/>';
  P.dimHV = '<path d="M4 9h16"/><path d="M4 9l4-2.2v4.4zM20 9l-4-2.2v4.4z" fill="currentColor" stroke="none"/><path d="M4 5v15M20 5v15"/><rect x="7" y="13" width="10" height="6" rx="1" stroke-dasharray="2 2"/>';
  P.dimAngular = '<path d="M4 20h16M4 20L15 5"/><path d="M12.5 20a8.5 8.5 0 00-3.5-6.9"/><path d="M12.5 20l-1.8-3.4 3.4.3zM9 13.1l3.7.6-1.9 2.6z" fill="currentColor" stroke="none"/>';
  P.dimSegment = '<path d="M3 18c4-9 9-12 18-12"/><circle cx="3" cy="18" r="1.6" fill="currentColor"/><circle cx="21" cy="6" r="1.6" fill="currentColor"/><path d="M6 21L21 10" stroke-dasharray="2 2"/>';
  P.dimCallout = '<path d="M4 20l7-8h9"/><circle cx="4" cy="20" r="1.6" fill="currentColor"/><path d="M12 8h8M12 5h6" />';
  P.connStraight = '<rect x="2.5" y="3.5" width="6" height="5" rx="1"/><rect x="15.5" y="15.5" width="6" height="5" rx="1"/><path d="M8.5 8.5l7 7"/>';
  P.connRight = '<rect x="2.5" y="3.5" width="6" height="5" rx="1"/><rect x="15.5" y="15.5" width="6" height="5" rx="1"/><path d="M8.5 6H12v12h3.5"/>';
  P.connRound = '<rect x="2.5" y="3.5" width="6" height="5" rx="1"/><rect x="15.5" y="15.5" width="6" height="5" rx="1"/><path d="M8.5 6H9a3 3 0 013 3v6a3 3 0 003 3h.5"/>';
  P.bitmap = '<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/><rect x="9.2" y="9.2" width="5.6" height="5.6" fill="currentColor" stroke="none" opacity=".45"/>';
  P.glyph = '<path d="M7 19l5-14 5 14M8.8 14h6.4"/><path d="M17.5 4.5l2 2M19.5 4.5l-2 2" stroke-width="1.3"/>';
  P.search = '<circle cx="10.5" cy="10.5" r="6.2"/><path d="M15.2 15.2l5 5"/>';
  P.preview = '<rect x="3" y="5" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 18v3"/><path d="M9 11.5l2 2 4-4"/>';
  P.sorter = '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>';
  P.fillTool = '<path d="M5 13l7-7 7 7-7 7z"/><path d="M12 6L9.5 3.5"/><path d="M5.5 13.5h13" stroke-dasharray="2 2"/><path d="M19.5 15.5c0 1.6 1 2.4 1 3.4a1 1 0 01-2 0c0-1 1-1.8 1-3.4z" fill="currentColor" stroke="none"/>';
  P.meshTool = '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 9.5c5 1 12-1 17 0M3.5 15c5 1 12-1 17 0M9.5 3.5c1 5-1 12 0 17M15 3.5c1 5-1 12 0 17"/><circle cx="9.6" cy="9.8" r="1.4" fill="currentColor"/><circle cx="15.1" cy="15.2" r="1.4" fill="currentColor"/>';
  P.transpTool = '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 20.5L20.5 3.5V20.5z" fill="currentColor" fill-opacity=".35" stroke="none"/><path d="M8 8h1.5M12 8h1.5M8 12h1.5" stroke-width="2"/>';
  P.smartFill = '<circle cx="9" cy="10" r="5.5"/><circle cx="15" cy="10" r="5.5"/><path d="M12 5.6a5.5 5.5 0 010 8.8 5.5 5.5 0 010-8.8z" fill="currentColor" stroke="none"/><path d="M18 17l2.5 2.5M16.5 20.5l4-4"/>';
  P.cropTool = '<path d="M6.5 2.5v15h15"/><path d="M2.5 6.5h15v15"/>';
  P.knifeTool = '<path d="M4 20L16.5 7.5l2-.5.5 2L6.5 21.5z"/><path d="M14 10l2 2"/><path d="M3 13l3-3M8 21l3-3" stroke-dasharray="1.5 1.5"/>';
  P.eraserTool = '<path d="M14.5 4.5l5 5L10 19H5.5l-2-2z"/><path d="M9.5 9.5l5 5"/><path d="M10 19h10"/>';
  P.smoothTool = '<path d="M3 15c2-3 3 2 5-1s3 2 5-1 3 2 5-1"/><path d="M3 20c4-3 14-3 18 0" stroke-dasharray="2 2"/><circle cx="17" cy="7" r="3.5"/>';
  P.smearTool = '<path d="M4 17c3-6 7-8 12-8"/><path d="M13 5l4 4-4 4"/><path d="M4 21c3-2 6-3 10-3" opacity=".5"/>';
  P.twirlTool = '<path d="M12 12c1.4 0 2-1.6 1-2.6-1.5-1.5-4.2-.4-4.2 1.8 0 3 3.5 4.6 6 3.1 3.4-2 3-7.3-.6-9-4.2-2-9.2 1.2-9.2 5.8 0 5 4.6 8.4 9.4 7.4"/>';
  P.attractTool = '<circle cx="12" cy="12" r="8.5" stroke-dasharray="2 2"/><path d="M12 4.5v4M12 19.5v-4M4.5 12h4M19.5 12h-4"/><path d="M10.3 7.2L12 9l1.7-1.8M10.3 16.8L12 15l1.7 1.8M7.2 10.3L9 12l-1.8 1.7M16.8 10.3L15 12l1.8 1.7"/>';
  P.repelTool = '<circle cx="12" cy="12" r="8.5" stroke-dasharray="2 2"/><path d="M12 9.5v-6M12 14.5v6M9.5 12h-6M14.5 12h6"/><path d="M10.3 5.2L12 3.5l1.7 1.7M10.3 18.8L12 20.5l1.7-1.7M5.2 10.3L3.5 12l1.7 1.7M18.8 10.3L20.5 12l-1.7 1.7"/>';
  P.roughenTool = '<path d="M3 16l2-4 2 5 2-6 2 6 2-5 2 5 2-6 2 5 2-3"/>';
  P.bsplineTool = '<path d="M4 18C7 6 17 6 20 18"/><path d="M4 18L8 6h8l4 12" stroke-dasharray="2 2"/><rect x="6.6" y="4.6" width="2.8" height="2.8" fill="currentColor"/><rect x="14.6" y="4.6" width="2.8" height="2.8" fill="currentColor"/>';
  P.polylineTool = '<path d="M3.5 18L8 7l5 9 2.5-4c1.5-2.5 3-3.5 5-3"/><circle cx="8" cy="7" r="1.5" fill="currentColor"/><circle cx="13" cy="16" r="1.5" fill="currentColor"/>';
  P.curve3Tool = '<path d="M4 18C7 8 17 8 20 18"/><circle cx="4" cy="18" r="1.7" fill="currentColor"/><circle cx="20" cy="18" r="1.7" fill="currentColor"/><circle cx="12" cy="10.5" r="1.7"/>';
  P.lassoTool = '<path d="M7 3.5l9 5.6-4 1.1-1.8 4z" fill="currentColor" stroke="none"/><path d="M12 16c-5 3-10 1-9.5-3S10 7 15 8s6.5 4.5 3.5 7.5c-1.6 1.6-4 2-6.5 1z" stroke-dasharray="2 2"/>';
  P.rect3Tool = '<path d="M3 15L14 4l7 7-11 11z"/><circle cx="3" cy="15" r="1.6" fill="currentColor"/><circle cx="14" cy="4" r="1.6" fill="currentColor"/><circle cx="21" cy="11" r="1.6" fill="currentColor"/>';
  P.ellipse3Tool = '<ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-35 12 12)"/><circle cx="4.6" cy="17.2" r="1.6" fill="currentColor"/><circle cx="19.4" cy="6.8" r="1.6" fill="currentColor"/><circle cx="15.2" cy="16.5" r="1.6" fill="currentColor"/>';
  P.cstarTool = '<path d="M12 2.5L17.6 20 3 9.2h18L6.4 20z"/>';
  P.graphTool = '<rect x="3.5" y="3.5" width="17" height="17"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>';
  P.perfectTool = '<path d="M4 12a4.5 4.5 0 019 0c0 3.5-4.5 6-4.5 6S4 15.5 4 12z"/><path d="M13 6h7l-3.5 6z"/><path d="M14 15h7v6h-7z"/>';
  P.smartDraw = '<path d="M5 18c-2-4 0-11 7-11s9 5 7 9" stroke-dasharray="2 2"/><rect x="5" y="6" width="14" height="12" rx="1"/><path d="M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor" stroke="none"/>';
  P.sketchTool = '<path d="M3.5 17c3-5 6-9 9-9s2.5 5 5.5 5 2.5-3 2.5-3"/><path d="M4 18.5c3-5 6.5-9 9.5-8.5s2 4.5 5 4" opacity=".5"/>';
  P.liveSketch = '<path d="M3.5 16c3-6 7-9 10-7s2 6 6 5"/><path d="M3 18c4-6 7.5-8 10.5-6" stroke-dasharray="1.5 2" opacity=".6"/><path d="M15 5l4 4" />';
  P.varOutline = '<path d="M3 16c3-6 5-8 8-8 4 0 5 7 10 3" stroke-width="1"/><path d="M3 18c2-2 3-2 4-1 2 2 3-6 6-6 2 0 3 5 8 1" fill="currentColor" fill-opacity=".25"/>';
  P.virtualDel = '<path d="M3 12h18M12 3v18"/><path d="M14 6l4 4M18 6l-4 4" stroke="#d6362b"/>';
  P.attrEyedropper = '<path d="M15.8 3.8a2.6 2.6 0 013.7 3.7l-2.6 2.6-3.7-3.7z"/><path d="M13.2 6.4L5.5 14.1l-.9 4.3 4.3-.9 7.7-7.7"/><rect x="14" y="15" width="7" height="6" rx="1" fill="currentColor" fill-opacity=".3"/>';
  P.cornerTool = '<path d="M4 20V11a7 7 0 017-7h9"/><path d="M4 20V4h16" stroke-dasharray="2 2" opacity=".5"/>';
  P.kind_perfect = P.perfectTool;
  P.kind_cstar = P.cstarTool;
  P.kind_varline = P.varOutline;
  P.kind_bspline = P.bsplineTool;
  P.kind_fillfx = '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/>';
  P.kind_mesh = P.meshTool;
  P.kind_dimension = P.dimParallel; P.kind_connector = P.connRight;
  P.kind_textpath = P.textpath; P.kind_paragraph = P.paragraph; P.kind_table = P.table;
  P.kind_blend = P.blend; P.kind_contour = P.contour; P.kind_envelope = P.envelope; P.kind_perspective = P.perspective;
  P.kind_extrude = P.extrude; P.kind_lens = P.lens; P.kind_powerclip = P.powerclip;
  P.kind_rect = P.rect; P.kind_ellipse = P.ellipse; P.kind_polygon = P.polygon; P.kind_star = P.star; P.kind_spiral = P.spiral; P.kind_text = P.text;

  /* v9: shadows, distortion, outlines, bitmap effects */
  P.shadowTool = '<rect x="3.5" y="3.5" width="11" height="11" rx="1"/><path d="M14.5 7.5h5v12h-12v-5" fill="currentColor" fill-opacity=".3" stroke="none"/><path d="M9 9l9 9" stroke-dasharray="2 2"/>';
  P.innerShadow = '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4.8 19V5.2c0-.2.2-.4.4-.4H19" stroke-width="3.2" stroke-opacity=".35"/>';
  P.blockShadow = '<path d="M4 4h10v10H4z"/><path d="M14 4l6 6v10H10l-6-6h10z" fill="currentColor" fill-opacity=".3" stroke="none"/>';
  P.distort = '<path d="M12 3l2.2 5.6L20 7l-3.4 5L20 17l-5.8-1.6L12 21l-2.2-5.6L4 17l3.4-5L4 7l5.8 1.6z"/>';
  P.pshadow = '<path d="M7 3.5h6v11H7z"/><path d="M7 14.5h6l7 5H14z" fill="currentColor" fill-opacity=".3" stroke="none"/>';
  P.arrowLine = '<path d="M4 18L18 6"/><path d="M11.5 6H18v6.5" fill="none"/>';
  P.calligraphy = '<path d="M4 18c3-9 6-12 8-10s-1 7 2 8 4-6 6-9" stroke-width="2.6"/>';
  P.bmpfx = '<rect x="3.5" y="5" width="17" height="14" rx="1.2"/><path d="M6 16l4-4.5 3 3 2-2 3 3.5"/><path d="M17 3.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" stroke="none"/>';
  P.pages = '<path d="M8 3.5h9.5v14H8z"/><path d="M5.5 6.5v14H15" />';
  P.comment = '<path d="M4 5h16v11H11l-4 4v-4H4z"/><path d="M8 9h8M8 12h5"/>';
  P.symbol = '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>';
  P.styles = '<path d="M5 5h14v4H5zM5 11h9v4H5zM5 17h11"/>';
  P.print = '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="1.2"/><path d="M7 14h10v6.5H7z"/><circle cx="17" cy="11.6" r=".8" fill="currentColor" stroke="none"/>';
  P.cut = '<circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="17.5" r="3"/><path d="M8.6 15.4L18.5 3.5M15.4 15.4L5.5 3.5"/>';
  P.copy = '<rect x="8.5" y="8.5" width="12" height="12" rx="1.2"/><path d="M15.5 8.5V4.7a1.2 1.2 0 00-1.2-1.2H4.7a1.2 1.2 0 00-1.2 1.2v9.6a1.2 1.2 0 001.2 1.2h3.8"/>';
  P.paste = '<path d="M9 4.5H6.2A1.2 1.2 0 005 5.7v14.1A1.2 1.2 0 006.2 21h11.6a1.2 1.2 0 001.2-1.2V5.7a1.2 1.2 0 00-1.2-1.2H15"/><rect x="9" y="3" width="6" height="3.5" rx="1"/><path d="M8.5 12h7M8.5 15.5h5"/>';
  P.fullscreen = '<path d="M3.5 9V3.5H9M15 3.5h5.5V9M20.5 15v5.5H15M9 20.5H3.5V15"/><rect x="8" y="8" width="8" height="8" rx=".8"/>';
  P.snapOff = '<path d="M6 4v8a6 6 0 0012 0V4"/><path d="M6 4h3.5v8a2.5 2.5 0 005 0V4H18"/><path d="M3.5 3.5l17 17" stroke-width="2"/>';
  P.outlinePen = '<path d="M4 20l3.5-1 10-10-2.5-2.5-10 10z"/><path d="M14 6.5l2.5 2.5M3.5 20.5h17" stroke-width="2.2"/>';
  P.hints = '<circle cx="12" cy="10" r="6"/><path d="M9.5 16.5h5M10 20h4M12 7v3.5M12 13v.3"/>';
  P.welcome = '<path d="M3.5 10.5L12 4l8.5 6.5V20H14v-5.5h-4V20H3.5z"/>';
  P.code ='<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>';
  P.ecCut = '<path d="M5 8.5a3.5 3.5 0 013.5-3.5h7A3.5 3.5 0 0119 8.5v7a3.5 3.5 0 01-3.5 3.5h-7A3.5 3.5 0 015 15.5z" stroke-dasharray="3 2"/><path d="M9 12h6"/>';
  P.ecMarks = '<rect x="3" y="3" width="4" height="4" fill="currentColor"/><rect x="17" y="3" width="4" height="4" fill="currentColor"/><rect x="3" y="17" width="4" height="4" fill="currentColor"/><rect x="17" y="17" width="4" height="4" fill="currentColor"/><rect x="8.5" y="8.5" width="7" height="7"/>';
  P.ecImpose = '<rect x="3.5" y="3.5" width="7" height="7"/><rect x="13.5" y="3.5" width="7" height="7"/><rect x="3.5" y="13.5" width="7" height="7"/><rect x="13.5" y="13.5" width="7" height="7"/>';
  P.ecNest = '<rect x="3.5" y="3.5" width="17" height="17"/><path d="M3.5 11h9v9.5M12.5 3.5V11M12.5 15h8"/>';
  P.ecWeed = '<rect x="3.5" y="3.5" width="17" height="17" stroke-dasharray="2.5 2"/><circle cx="9" cy="9" r="2.5"/><rect x="13" y="13" width="5" height="5"/><path d="M12 3.5v17M3.5 12h17" stroke-width=".9"/>';  P.kind_pshadow = P.pshadow; P.kind_innerShadow = P.innerShadow; P.kind_blockShadow = P.blockShadow; P.kind_distort = P.distort; P.kind_transpfx = P.transpTool || P.lens;

  window.VPIcon = function (name, cls) {
    const body = P[name] || P.plus;
    return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  };
  window.VPIcon.has = (name) => !!P[name];
})();
