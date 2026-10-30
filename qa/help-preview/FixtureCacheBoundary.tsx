import React, {useEffect,useState} from 'react';
import {View} from 'react-native';
import {loadFixtureSnapshot} from './fixturePersistence';

/** Hydrate the fixture before mounting its actual HelpScreen, without a list spinner. */
export function FixtureCacheBoundary({children}:{children:React.ReactNode}){
  const [ready,setReady]=useState(false);
  useEffect(()=>{let alive=true;void loadFixtureSnapshot().finally(()=>{if(alive)setReady(true);});return()=>{alive=false;};},[]);
  return ready ? <>{children}</> : <View style={{flex:1,backgroundColor:'#151B22'}}/>;
}
