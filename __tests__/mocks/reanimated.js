const React = require('react');
const Native = require('react-native');

module.exports = {
  __esModule: true,
  default: { View: Native.View, Text: Native.Text, createAnimatedComponent: component => component },
  runOnUI: callback => callback,
  runOnJS: callback => callback,
  useSharedValue: value => React.useRef({ value }).current,
  useAnimatedStyle: callback => callback(),
  withTiming: value => value,
  withSpring: value => value,
  cancelAnimation: jest.fn(),
  Easing: { out: easing => easing, cubic: value => value },
};
