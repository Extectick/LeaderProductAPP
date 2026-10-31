import { registerRootComponent } from 'expo';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import HelpPreview from './HelpPreview';
import { enableHelpFixtureControls } from '../../src/features/help/helpDiagnostics';
enableHelpFixtureControls();
registerRootComponent(() => React.createElement(GestureHandlerRootView,{style:{flex:1}},React.createElement(HelpPreview)));
