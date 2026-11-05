import 'react-native-gesture-handler';
import {registerRootComponent} from 'expo';
import React from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PaperProvider} from 'react-native-paper';
import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
import {EntityCardProvider} from '../../src/features/entityCards/EntityCardProvider';
import {FixtureAuthProvider} from './fixtureAuth';
import {ThemeProvider} from './fixtureTheme';
import EntityPreview from './EntityPreview';

registerRootComponent(()=>React.createElement(GestureHandlerRootView,{style:{flex:1}},
 React.createElement(SafeAreaProvider,null,React.createElement(PaperProvider,null,
  React.createElement(BottomSheetModalProvider,null,React.createElement(ThemeProvider,null,
   React.createElement(FixtureAuthProvider,null,React.createElement(EntityCardProvider,null,React.createElement(EntityPreview)))))))));
