import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
let mockTheme='light';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:mockTheme})}));
import {useHelpTheme} from '../src/features/help/helpTheme';
test('unchanged theme retains palette identity while a real theme change updates colors',async()=>{
  let palette!:ReturnType<typeof useHelpTheme>,view!:TestRenderer.ReactTestRenderer;
  function Harness({revision}:{revision:number}){palette=useHelpTheme();return React.createElement('Palette',{revision});}
  await act(async()=>{view=TestRenderer.create(React.createElement(Harness,{revision:0}));});
  try{
    const light=palette;
    await act(async()=>view.update(React.createElement(Harness,{revision:1})));
    expect(palette).toBe(light);
    mockTheme='dark';await act(async()=>view.update(React.createElement(Harness,{revision:2})));
    expect(palette).not.toBe(light);expect(palette.background).not.toBe(light.background);
    mockTheme='light';await act(async()=>view.update(React.createElement(Harness,{revision:3})));
    expect(palette).toBe(light);
  }finally{mockTheme='light';await act(async()=>view.unmount());}
});
