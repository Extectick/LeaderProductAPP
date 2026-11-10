import React from 'react';

/** A fixed vector box avoids icon-font hinting and baseline rounding at 100% zoom. */
export function AppSearchGlyph({color}:{color:string}) {
  return <svg data-testid="app-search-glyph" aria-hidden="true" focusable="false" width={20} height={20} viewBox="0 0 24 24"
    fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
    style={{display:'block',flexShrink:0,marginRight:8}}>
    <circle cx={10.5} cy={10.5} r={7}/><path d="m16 16 5 5"/>
  </svg>;
}
