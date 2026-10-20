import { StyleSheet, Text, View } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { MARKER_LABEL_MAX_WIDTH } from '@/lib/location-map-view';

/** Job location (dark) and the Worker's live position (blue); `group` when the two overlap. */
export type MapPinKind = 'destination' | 'worker' | 'group';

/** A labelled map marker: a chip above a dot that sits on the coordinate (use Marker anchor="bottom"). */
export function MapPinLabel({ kind, label, stale = false }: { kind: MapPinKind; label: string; stale?: boolean }) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const fill = pinColor(ui, kind);
  // A stale pin keeps its colour family but drops the solid fill, so "live" reads at a glance.
  return (
    <View style={styles.pin} pointerEvents="none">
      <View style={[styles.chip, { backgroundColor: stale ? ui.colors.surface : fill, borderColor: fill }]}>
        <Text style={[styles.label, { color: stale ? fill : ui.colors.onAccent }]} numberOfLines={2}>{label}</Text>
      </View>
      <View style={[styles.dot, { backgroundColor: fill, borderColor: ui.colors.surface }]} />
    </View>
  );
}

export function pinColor(ui: UiTheme, kind: MapPinKind): string {
  if (kind === 'destination') return ui.colors.textPrimary;
  if (kind === 'worker') return ui.colors.accent;
  return ui.colors.textSecondary;
}

function createStyles(ui: UiTheme) {
  return StyleSheet.create({
    pin: { alignItems: 'center', maxWidth: MARKER_LABEL_MAX_WIDTH },
    chip: { borderWidth: 2, borderRadius: ui.radius.pill, paddingHorizontal: ui.spacing.sm, paddingVertical: ui.spacing.xs },
    label: { ...ui.type.label, textAlign: 'center' },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 2 },
  });
}
