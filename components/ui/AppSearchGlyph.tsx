import React from 'react';
import {Ionicons} from '@expo/vector-icons';

export function AppSearchGlyph({color}:{color:string}) {
  return <Ionicons name="search-outline" size={20} color={color} style={{marginRight:8}} accessible={false}/>;
}
