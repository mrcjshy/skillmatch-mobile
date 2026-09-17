import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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
      <Text style={styles.label}>Date</Text>
      <Pressable
        style={[styles.row, disabled && styles.rowDisabled]}
        onPress={openDate}
        disabled={disabled || !pickerAvailable}
        accessibilityRole="button"
        accessibilityLabel="Scheduled Date"
        accessibilityState={{ disabled: disabled || !pickerAvailable }}
      >
        <Text style={dateLabel ? styles.value : styles.placeholder}>
          {dateLabel ?? 'Choose date'}
        </Text>
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
            accentColor={colors.primary}
            disabled={disabled}
            onValueChange={(_event, selected) => {
              onChangeDate(selected);
              if (Platform.OS === 'android') closeDate();
            }}
            onDismiss={closeDate}
          />
        </PickerErrorBoundary>
      ) : null}

      <Text style={styles.label}>Time</Text>
      <Pressable
        style={[styles.row, disabled && styles.rowDisabled]}
        onPress={openTime}
        disabled={disabled || !pickerAvailable}
        accessibilityRole="button"
        accessibilityLabel="Scheduled Time"
        accessibilityState={{ disabled: disabled || !pickerAvailable }}
      >
        <Text style={timeLabel ? styles.value : styles.placeholder}>
          {timeLabel ?? 'Choose time'}
        </Text>
      </Pressable>

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
            accentColor={colors.primary}
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
  label: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.primary,
  },
  row: {
    height: size.fieldHeight,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderCurve: 'continuous',
  },
  rowDisabled: {
    opacity: 0.6,
  },
  value: {
    ...type.body,
    color: colors.textPrimary,
  },
  placeholder: {
    ...type.body,
    color: colors.textDisabled,
  },
  note: {
    ...type.helper,
    color: colors.warning,
  },
});
