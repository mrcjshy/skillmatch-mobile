import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminTabBar, ClientTabBar, WorkerTabBar } from './client-tab-bar';

const observed = vi.hoisted(() => ({ tabs: [], buttons: [] }));
vi.mock('react-native', () => {
  const View = ({ children }) => <div>{children}</div>;
  return {
    Animated: { View }, View, Text: View, Platform: { select: (options) => options.android ?? options.default },
    Pressable: ({ children, role, style, ...props }) => {
      if (role === 'tab') observed.tabs.push({ style, label: props['aria-label'] ?? '' });
      else if (props.accessibilityLabel) observed.buttons.push(props.accessibilityLabel);
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
  beforeEach(() => { observed.tabs = []; observed.buttons = []; });
  it('keeps four accessible tabs, icons only, each a full 48dp target', () => {
    const routes = ['Home', 'My jobs', 'Bookings', 'Profile'].map((name) => ({ key: name, name }));
    const descriptors = Object.fromEntries(routes.map((route) => [route.key, { options: { title: route.name, tabBarAccessibilityLabel: route.name } }]));
    const props = { state: { key: 'tabs', index: 2, routes }, descriptors, navigation: {}, insets: { top: 0, bottom: 0, left: 0, right: 0 }, onPostJob: () => {}, postDisabled: false, posting: false };
    const markup = renderToStaticMarkup(<ClientTabBar {...props} />);
    expect(observed.tabs.map((tab) => tab.label)).toEqual(['Home', 'My jobs', 'Bookings', 'Profile']);
    for (const tab of observed.tabs) {
      expect(tab.style[0]).toMatchObject({ flex: 1, minHeight: 48, paddingHorizontal: 0, paddingVertical: 5 });
    }
    // Names are heard, not shown.
    for (const name of ['Home', 'My jobs', 'Bookings', 'Profile']) expect(markup).not.toContain(name);
  });
  it('gives Worker the same floating pill with its three tabs and no Post a job action', () => {
    const routes = ['Home', 'Bookings', 'Profile'].map((name) => ({ key: name, name }));
    const descriptors = Object.fromEntries(routes.map((route) => [route.key, { options: { title: route.name, tabBarAccessibilityLabel: route.name } }]));
    renderToStaticMarkup(<WorkerTabBar state={{ key: 'tabs', index: 0, routes }} descriptors={descriptors} navigation={{}} insets={{ top: 0, bottom: 0, left: 0, right: 0 }} />);
    expect(observed.tabs.map((tab) => tab.label)).toEqual(['Home', 'Bookings', 'Profile']);
    expect(observed.buttons).not.toContain('Post a job');
  });
  it('gives Admin the same floating pill with its four destinations and no Post a job action', () => {
    const routes = ['Home', 'Workers', 'Clients', 'Reports'].map((name) => ({ key: name, name }));
    const descriptors = Object.fromEntries(routes.map((route) => [route.key, { options: { title: route.name, tabBarAccessibilityLabel: route.name } }]));
    renderToStaticMarkup(<AdminTabBar state={{ key: 'tabs', index: 0, routes }} descriptors={descriptors} navigation={{}} insets={{ top: 0, bottom: 0, left: 0, right: 0 }} />);
    expect(observed.tabs.map((tab) => tab.label)).toEqual(['Home', 'Workers', 'Clients', 'Reports']);
    expect(observed.buttons).not.toContain('Post a job');
  });
});
