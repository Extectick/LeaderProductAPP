import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StockSalesChart,SALES_CHART_HEIGHT} from '../src/features/stockBalances/StockSalesChart';
const mockChart={setOption:jest.fn(),on:jest.fn(),off:jest.fn(),dispose:jest.fn()};
jest.mock('react-native',()=>({View:'View',Pressable:'Pressable',ScrollView:'ScrollView',StyleSheet:{create:(s:any)=>s,hairlineWidth:1}}));
jest.mock('react-native-paper',()=>({Text:'Text',ActivityIndicator:'Spinner'}));
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:'Icon'}));
jest.mock('echarts/core',()=>({use:jest.fn(),init:()=>mockChart}));
jest.mock('echarts/charts',()=>({BarChart:{},LineChart:{}}));
jest.mock('echarts/components',()=>({GridComponent:{}}));
jest.mock('@wuba/react-native-echarts/svgChart',()=>({__esModule:true,SVGRenderer:{},default:require('react').forwardRef((props:any,ref:any)=>{
  require('react').useImperativeHandle(ref,()=>({}));return require('react').createElement('SvgChart',props);
})}));
const item:any={id:'1',direction:'expense',operationKind:'Реализация товаров',document:{type:'РеализацияТоваровУслуг',number:'УТ-1'},baseDocuments:[],movementAt:'2026-10-22',quantity:6,price:1500,amount:9000,currency:'RUB',counterparty:'Клиент'};
let view:TestRenderer.ReactTestRenderer;
beforeEach(()=>jest.clearAllMocks());
afterEach(()=>act(()=>view?.unmount()));
function mount(items=[item]){
  act(()=>{view=TestRenderer.create(React.createElement(StockSalesChart,{items,period:{from:'2026-10-21',to:'2026-10-22'},scope:'a',complete:true,error:null,online:true,unit:'кг',onRetry:jest.fn()}));});
  act(()=>view.root.findByProps({testID:'stock-sales-chart'}).props.onLayout({nativeEvent:{layout:{width:390}}}));
}
it('switches one compact chart from quantities to prices, with gaps instead of zero prices',()=>{
  mount();
  expect(view.root.findByProps({testID:'stock-sales-chart'}).props.style.height).toBe(SALES_CHART_HEIGHT);
  expect(mockChart.setOption.mock.calls.at(-1)[0].series[0].type).toBe('bar');
  act(()=>view.root.findByProps({accessibilityLabel:'График цены'}).props.onPress());
  const option=mockChart.setOption.mock.calls.at(-1)[0];
  expect(option.series[0].type).toBe('line');
  expect(option.series[0].data.map((x:any)=>x.value)).toEqual([null,1500]);
  expect(option.yAxis.max-option.yAxis.min).toBeGreaterThanOrEqual(90);
  expect(view.root.findAllByType('SvgChart' as any)).toHaveLength(1);
  const click=mockChart.on.mock.calls.at(-1)[1];
  act(()=>click({data:{day:'2026-10-22'}}));
  expect(JSON.stringify(view.toJSON())).toContain('Клиент');
  act(()=>view.root.findByProps({accessibilityLabel:'График количества'}).props.onPress());
  expect(view.root.findAllByProps({accessibilityLabel:'Закрыть данные продажи'})).toHaveLength(0);
});
it('does not combine prices in different currencies',()=>{
  mount([item,{...item,id:'2',currency:'USD'}]);
  act(()=>view.root.findByProps({accessibilityLabel:'График цены'}).props.onPress());
  expect(JSON.stringify(view.toJSON())).toContain('Цены в разных валютах');
  expect(view.root.findAllByType('SvgChart' as any)).toHaveLength(0);
});
