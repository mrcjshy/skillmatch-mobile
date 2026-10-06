import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import regular from 'expo-symbols/androidWeights/regular';
import { useFonts } from 'expo-font';
import { useUiTheme, RefinementTheme } from '@/components/refinement-theme';
import { Platform, Text, View, useWindowDimensions } from 'react-native';

// Same glyphs as installed expo-symbols; refinement roots, and callers that opt in via
// `synchronousGlyph`, use the synchronous font path. Other surfaces keep SymbolView.
const glyphs: Record<string, string> = {
  account_balance_wallet: '\ue850', add: '\ue145', arrow_forward: '\ue5c8', calendar_month: '\uebcc',
  calendar_today: '\ue935', call: '\ue0b0', cancel: '\ue5c9', carpenter: '\uf1f8',
  chat_bubble_outline: '\ue0cb', check: '\ue5ca', check_circle: '\ue86c', chevron_right: '\ue5cc',
  cleaning_services: '\uf0ff', close: '\ue5cd', description: '\ue873', done: '\ue876',
  edit: '\ue3c9', electrical_services: '\uf102', expand_less: '\ue5ce', expand_more: '\ue5cf',
  flag: '\ue153', format_paint: '\ue243', handyman: '\uf10b', home: '\ue88a',
  info: '\ue88e', list_alt: '\ue0ee', location_on: '\ue0c8', logout: '\ue9ba',
  mail_outline: '\ue0e1', notifications_none: '\ue7f5', pause: '\ue034', person: '\ue7fd',
  phone: '\ue0cd', photo_library: '\ue413', plumbing: '\uf107', receipt_long: '\uef6e',
  schedule: '\ue8b5', settings: '\ue8b8', verified: '\uef76', work_outline: '\ue943',
  yard: '\uf089',
  // Wave 1 additions (code points from expo-symbols android/symbols.json)
  arrow_back: '\ue5c4', badge: '\uea67', block: '\ue14b', cloud_off: '\ue2c1',
  error: '\ue000', help_outline: '\ue8fd', hourglass_empty: '\ue88b', link_off: '\ue16f',
  lock: '\ue897', mark_email_unread: '\uf18a', photo_camera: '\ue412', refresh: '\ue5d5',
  upload_file: '\ue9fc', verified_user: '\ue8e8', visibility: '\ue8f4', visibility_off: '\ue8f5',
  warning: '\ue002',
};

/** Expo's Android symbol is scalable text inside a fixed-size view. Reserve its full bounds. */
export function AppSymbol({ style, synchronousGlyph = false, ...props }: SymbolViewProps & { synchronousGlyph?: boolean }) {
  const { fontScale } = useWindowDimensions();
  const ui = useUiTheme();
  const scoped = Platform.OS === 'android' && (ui === RefinementTheme || synchronousGlyph);
  const [loaded] = useFonts(scoped ? { [regular.name]: regular.font } : {});
  const extent = (props.size ?? 24) * (Platform.OS === 'android' ? fontScale : 1);
  const name = typeof props.name === 'object' ? props.name.android : undefined;
  if (scoped && loaded && name && glyphs[name]) {
    const { name: _name, size: _size, tintColor, weight: _weight, ...viewProps } = props;
    return <View {...viewProps} style={[style, { width: extent, height: extent, flexShrink: 0 }]}>
      <Text accessible={false} style={{ fontFamily: regular.name, fontSize: props.size ?? 24, lineHeight: props.size ?? 24, color: tintColor }}>{glyphs[name]}</Text>
    </View>;
  }
  return <SymbolView {...props} style={[style, { width: extent, height: extent, flexShrink: 0 }]} />;
}
