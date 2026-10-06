import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppSymbol } from '@/components/app-symbol';
import { SkillMatchTheme } from '@/constants/theme';
import { formatScheduleDate, formatScheduleTime } from '@/lib/date-time';
import { scheduleMinimumDate } from '@/lib/job-posting-schedule';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

type DateTimePickerComponent = typeof import('@expo/ui/community/datetime-picker').default;

function loadDateTimePicker(): DateTimePickerComponent | null {
  try {
    // Native ExpoUI views are evaluated on require. Catch so a reused APK
    // without DatePickerDialogView still shows Post Job instead of crashing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const picker = require('@expo/ui/community/datetime-picker') as typeof import('@expo/ui/community/datetime-picker');
    return picker.default;
  } catch {
    return null;
  }
}

const DateTimePicker = loadDateTimePicker();

type JobSchedulePickerProps = {
  date: Date | null;
  time: Date | null;
  onChangeDate: (date: Date) => void;
  onChangeTime: (time: Date) => void;
  disabled?: boolean;
};

class PickerErrorBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onError();
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function JobSchedulePicker({
  date,
  time,
  onChangeDate,
  onChangeTime,
  disabled = false,
}: JobSchedulePickerProps) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [pickerReady, setPickerReady] = useState(DateTimePicker !== null);
  const pickerAvailable = pickerReady && DateTimePicker !== null;

  const dateValue = date ?? new Date();
  const timeValue = time ?? date ?? new Date();
  const dateLabel = date ? formatScheduleDate(date) : null;
  const timeLabel = time ? formatScheduleTime(time) : null;

  function openDate(): void {
    if (disabled || !pickerAvailable) return;
    setShowTime(false);
    setShowDate((open) => !open);
  }

  function openTime(): void {
    if (disabled || !pickerAvailable) return;
    setShowDate(false);
    setShowTime((open) => !open);
  }

  function closeDate(): void {
    setShowDate(false);
  }

  function closeTime(): void {
    setShowTime(false);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.group}>
      <Pressable
        style={({ pressed }) => [styles.row, disabled && styles.rowDisabled, pressed && !disabled ? styles.rowPressed : null]}
        onPress={openDate}
        disabled={disabled || !pickerAvailable}
        accessibilityRole="button"
        accessibilityLabel="Scheduled date"
        // The chosen date is the row's value ("Scheduled date, <date>"); the hint names the action.
        accessibilityValue={{ text: dateLabel ?? 'Not selected' }}
        accessibilityHint={dateLabel ? 'Change date' : 'Choose date'}
        accessibilityState={{ disabled: disabled || !pickerAvailable }}
      >
        <AppSymbol name={{ android: 'event', ios: 'calendar' }} size={size.icon} tintColor={colors.accent} />
        <View style={styles.rowCopy}>
          <Text style={styles.label}>Date</Text>
          <Text style={dateLabel ? styles.value : styles.placeholder}>
            {dateLabel ?? 'Choose date'}
          </Text>
        </View>
        <Text style={styles.action}>{dateLabel ? 'Change' : 'Choose'}</Text>
      </Pressable>

      {pickerAvailable && showDate && DateTimePicker ? (
        <PickerErrorBoundary
          onError={() => {
            setPickerReady(false);
            closeDate();
          }}
        >
          <DateTimePicker
            value={dateValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            presentation="dialog"
            minimumDate={scheduleMinimumDate()}
            is24Hour={false}
            accentColor={colors.accent}
            disabled={disabled}
            onValueChange={(_event, selected) => {
              onChangeDate(selected);
              if (Platform.OS === 'android') closeDate();
            }}
            onDismiss={closeDate}
          />
        </PickerErrorBoundary>
      ) : null}

      <View style={styles.divider} />
      <Pressable
        style={({ pressed }) => [styles.row, disabled && styles.rowDisabled, pressed && !disabled ? styles.rowPressed : null]}
        onPress={openTime}
        disabled={disabled || !pickerAvailable}
        accessibilityRole="button"
        accessibilityLabel="Scheduled time"
        accessibilityValue={{ text: timeLabel ?? 'Not selected' }}
        accessibilityHint={timeLabel ? 'Change time' : 'Choose time'}
        accessibilityState={{ disabled: disabled || !pickerAvailable }}
      >
        <AppSymbol name={{ android: 'schedule', ios: 'clock' }} size={size.icon} tintColor={colors.accent} />
        <View style={styles.rowCopy}>
          <Text style={styles.label}>Time</Text>
          <Text style={timeLabel ? styles.value : styles.placeholder}>
            {timeLabel ?? 'Choose time'}
          </Text>
        </View>
        <Text style={styles.action}>{timeLabel ? 'Change' : 'Choose'}</Text>
      </Pressable>
      </View>

      {pickerAvailable && showTime && DateTimePicker ? (
        <PickerErrorBoundary
          onError={() => {
            setPickerReady(false);
            closeTime();
          }}
        >
          <DateTimePicker
            value={timeValue}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            presentation="dialog"
            is24Hour={false}
            accentColor={colors.accent}
            disabled={disabled}
            onValueChange={(_event, selected) => {
              onChangeTime(selected);
              if (Platform.OS === 'android') closeTime();
            }}
            onDismiss={closeTime}
          />
        </PickerErrorBoundary>
      ) : null}

      {!pickerAvailable ? (
        <Text style={styles.note}>
          Date and time picker is unavailable on this app build.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  row: {
    minHeight: size.listRowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  label: {
    ...type.helper,
    color: colors.textSecondary,
  },
  value: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  placeholder: {
    ...type.body,
    color: colors.textSecondary,
  },
  action: {
    ...type.label,
    color: colors.accent,
    flexShrink: 0,
  },
  note: {
    ...type.helper,
    color: colors.warning,
  },
});
