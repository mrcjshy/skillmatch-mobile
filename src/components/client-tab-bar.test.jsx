import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientTabBar } from './client-tab-bar';

const observed = vi.hoisted(() => ({ tabs: [] }));
vi.mock('react-native', () => {
  const View = ({ children }) => <div>{children}</div>;
  return {
    Animated: { View }, View, Text: View, Platform: { select: (options) => options.android ?? options.default },
    Pressable: ({ children, role, style, ...props }) => {
      if (role === 'tab') observed.tabs.push({ style, label: props['aria-label'] ?? '' });
      return <div>{children}</div>;
    },
    StyleSheet: { create: (styles) => styles },
  };
});
vi.mock('expo-router/react-navigation', () => ({ CommonActions: { navigate: vi.fn() } }));
vi.mock('@/components/app-symbol', () => ({ AppSymbol: () => null }));
vi.mock('@/components/app-tab-bar', () => ({ TAB_ACTIVE_COLOR: 'blue', TAB_INACTIVE_COLOR: 'gray' }));
vi.mock('@/components/motion', () => ({ MotionView: ({ children }) => <div>{children}</div>, usePressScale: () => ({ style: {} }) }));


describe('Client bottom navigation', () => {
  beforeEach(() => { observed.tabs = []; });
  it('keeps four accessible tabs while reserving their width for readable labels', () => {
    const routes = ['Home', 'My jobs', 'Bookings', 'Profile'].map((name) => ({ key: name, name }));
    const descriptors = Object.fromEntries(routes.map((route) => [route.key, { options: { title: route.name, tabBarAccessibilityLabel: route.name } }]));
    const props = { state: { key: 'tabs', index: 2, routes }, descriptors, navigation: {}, insets: { top: 0, bottom: 0, left: 0, right: 0 }, onPostJob: () => {}, postDisabled: false, posting: false };
    renderToStaticMarkup(<ClientTabBar {...props} />);
    expect(observed.tabs.map((tab) => tab.label)).toEqual(['Home', 'My jobs', 'Bookings', 'Profile']);
    for (const tab of observed.tabs) {
      expect(tab.style[0]).toMatchObject({ flex: 1, paddingHorizontal: 0, paddingVertical: 5 });
    }
  });
});

