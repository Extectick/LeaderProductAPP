import { registerRootComponent } from 'expo';
import HelpPreview from './HelpPreview';
import { enableHelpFixtureControls } from '../../src/features/help/helpDiagnostics';
enableHelpFixtureControls();
registerRootComponent(HelpPreview);
