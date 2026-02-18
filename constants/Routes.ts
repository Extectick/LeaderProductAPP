import React, { ComponentType } from 'react';

/**
 * @deprecated Legacy react-navigation tabs config.
 * Use expo-router file-based routes instead.
 */

export interface RouteConfig {
  name: string;
  component: ComponentType;
  icon: (focused: boolean) => React.ReactElement;
  tabBarLabel: string;
}

/**
 * @deprecated Legacy container kept as compatibility stub.
 * Source of truth is expo-router file system routes.
 */
export const routes: RouteConfig[] = [];
