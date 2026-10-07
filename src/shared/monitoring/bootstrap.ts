import { initMonitoring, installGlobalJsErrorHandler } from './index';

// Import before router registration so failures during module loading are captured.
initMonitoring();
installGlobalJsErrorHandler();
