import React from 'react';
import {Redirect} from 'expo-router';

/** Keep old bookmarks working with the same home used on the phone. */
export default function HomeScreen() {
  return <Redirect href="/services"/>;
}
