import { initMonitoring, installGlobalJsErrorHandler } from './index';

// Run before router modules: include failures during screen-module loading.
initMonitoring();
installGlobalJsErrorHandler();
