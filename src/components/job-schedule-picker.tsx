import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIconButton } from '@/components/app-icon-button';
import { AppSegment } from '@/components/app-segment';
import { AppSheet } from '@/components/app-sheet';
import { AppSymbol } from '@/components/app-symbol';
import { MotionView, useMotion } from '@/components/motion';
import { SkillMatchTheme } from '@/constants/theme';
import { formatScheduleDate, formatScheduleTime } from '@/lib/date-time';
import {
  SCHEDULE_PERIODS,
  availableScheduleSlots,
  firstOpenSchedulePeriod,
  isScheduleDayOpen,
  isScheduleDaySelectable,
  isScheduleSlotOpen,
  scheduleDayStrip,
  scheduleMonthWeeks,
  schedulePeriodForTime,
  type SchedulePeriod,
} from '@/lib/job-posting-schedule';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

const STRIP_DAYS = 14;
const MINUTE = 60_000;
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type JobSchedulePickerProps = {
  date: Date | null;
  time: Date | null;
  onChangeDate: (date: Date) => void;
  onChangeTime: (time: Date | null) => void;
  disabled?: boolean;
};

const sameDay = (a: Date | null, b: Date) => a !== null && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const monthName = (year: number, month: number) => new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
const shortMonth = (date: Date) => new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date);
const longDay = (date: Date) => new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(date);

/**
 * When the job happens, chosen in place: a strip of the next two weeks led by Today and Tomorrow,
 * a month calendar for anything later, then half-hour slots by part of the day. Today only offers
 * times still ahead, so an offered slot is always one that can be posted.
 */
export function JobSchedulePicker({ date, time, onChangeDate, onChangeTime, disabled = false }: JobSchedulePickerProps) {
  const motion = useMotion();
  const [now, setNow] = useState(() => new Date());
  const [chosenPeriod, setChosenPeriod] = useState<SchedulePeriod | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() }));

  // A screen left open keeps today's slots honest.
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), MINUTE);
    return () => clearInterval(clock);
  }, []);

  const days = scheduleDayStrip(now, STRIP_DAYS);
  const farDate = date !== null && !days.some(day => sameDay(date, day.date)) ? date : null;
  const period = date === null ? null : chosenPeriod ?? (time ? schedulePeriodForTime(time) : firstOpenSchedulePeriod(date, now) ?? 'morning');
  const slots = date !== null && period !== null ? availableScheduleSlots(date, period, now) : [];

  function chooseDate(day: Date) {
    onChangeDate(day);
    setChosenPeriod(null);
    if (time !== null && !isScheduleSlotOpen(day, time, new Date())) onChangeTime(null);
  }

  function openCalendar() {
    const start = date ?? now;
    setCalendarMonth({ year: start.getFullYear(), month: start.getMonth() });
    setCalendarOpen(true);
  }

  function shiftMonth(step: number) {
    const moved = new Date(calendarMonth.year, calendarMonth.month + step, 1);
    setCalendarMonth({ year: moved.getFullYear(), month: moved.getMonth() });
  }

  const canGoBack = new Date(calendarMonth.year, calendarMonth.month, 1) > new Date(now.getFullYear(), now.getMonth(), 1);
  const canGoForward = isScheduleDaySelectable(new Date(calendarMonth.year, calendarMonth.month + 1, 1), now);

  return (
    <View style={styles.wrap}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Date" style={styles.dateRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stripViewport} contentContainerStyle={styles.strip} keyboardShouldPersistTaps="handled">
          {days.map(({ date: day, title }) => {
            const selected = sameDay(date, day);
            const closed = !isScheduleDayOpen(day, now);
            const blocked = disabled || closed;
            return (
              <Pressable
                key={day.getTime()}
                onPress={() => chooseDate(day)}
                disabled={blocked}
                accessibilityRole="radio"
                accessibilityLabel={`${title}, ${formatScheduleDate(day)}`}
                accessibilityState={{ selected, disabled: blocked }}
                style={({ pressed }) => [styles.pill, selected && styles.pillSelected, pressed && !blocked && !selected && styles.pillPressed, closed && styles.pillClosed]}
              >
                <Text style={[styles.pillCaption, selected && styles.onAccent]}>{title}</Text>
                <Text style={[styles.pillDay, selected && styles.onAccent]}>{day.getDate()}</Text>
                <Text style={[styles.pillCaption, selected && styles.onAccent]}>{shortMonth(day)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
            onPress={openCalendar}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={farDate ? `Change date, ${formatScheduleDate(farDate)}` : 'More dates'}
            accessibilityState={{ selected: farDate !== null, disabled }}
            style={({ pressed }) => [styles.pill, farDate !== null && styles.pillSelected, pressed && !disabled && farDate === null && styles.pillPressed]}
          >
            {farDate ? <>
              <Text style={[styles.pillCaption, styles.onAccent]}>{shortMonth(farDate)}</Text>
              <Text style={[styles.pillDay, styles.onAccent]}>{farDate.getDate()}</Text>
              <Text style={[styles.pillCaption, styles.onAccent]}>{farDate.getFullYear()}</Text>
            </> : <>
              <AppSymbol name={{ android: 'calendar_month', ios: 'calendar' }} size={24} tintColor={colors.accent} />
              <Text style={styles.pillMore}>More</Text>
            </>}
        </Pressable>
      </View>

      {date !== null && period !== null ? <>
        <AppSegment
          options={SCHEDULE_PERIODS}
          value={period}
          onChange={setChosenPeriod}
          disabled={disabled}
          accessibilityLabel="Time of day"
        />
        <MotionView key={`${date.getTime()}:${period}`} entering={motion.fadeIn} accessibilityRole="radiogroup" accessibilityLabel="Time" style={styles.slots}>
          {slots.map(slot => {
            const selected = time !== null && time.getHours() === slot.getHours() && time.getMinutes() === slot.getMinutes();
            const label = formatScheduleTime(slot) ?? '';
            return (
              <Pressable
                key={slot.getTime()}
                onPress={() => onChangeTime(slot)}
                disabled={disabled}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ selected, disabled }}
                style={({ pressed }) => [styles.slot, selected && styles.slotSelected, pressed && !disabled && !selected && styles.pillPressed]}
              >
                <Text style={[styles.slotLabel, selected && styles.onAccent]}>{label}</Text>
              </Pressable>
            );
          })}
        </MotionView>
        {slots.length === 0 ? <Text style={styles.note}>No times left today in this part of the day.</Text> : null}
      </> : null}

      <AppSheet visible={calendarOpen} onClose={() => setCalendarOpen(false)} title="Choose a date" swipeToClose>
        <View style={styles.monthHeader}>
          <AppIconButton icon={{ android: 'chevron_left', ios: 'chevron.left' }} accessibilityLabel="Previous month" disabled={!canGoBack} onPress={() => shiftMonth(-1)} />
          <Text accessibilityRole="header" style={styles.monthTitle}>{monthName(calendarMonth.year, calendarMonth.month)}</Text>
          <AppIconButton icon={{ android: 'chevron_right', ios: 'chevron.right' }} accessibilityLabel="Next month" disabled={!canGoForward} onPress={() => shiftMonth(1)} />
        </View>
        <View style={styles.week} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {WEEKDAYS.map((weekday, index) => <Text key={index} style={styles.weekday}>{weekday}</Text>)}
        </View>
        {scheduleMonthWeeks(calendarMonth.year, calendarMonth.month).map((week, index) => (
          <View key={index} style={styles.week}>
            {week.map((day, cell) => {
              if (day === null) return <View key={cell} style={styles.dayCell} />;
              const selected = sameDay(date, day);
              const today = sameDay(now, day);
              const open = isScheduleDaySelectable(day, now) && isScheduleDayOpen(day, now);
              return (
                <Pressable
                  key={cell}
                  onPress={() => { chooseDate(day); setCalendarOpen(false); }}
                  disabled={!open}
                  accessibilityRole="button"
                  accessibilityLabel={longDay(day)}
                  accessibilityState={{ selected, disabled: !open }}
                  style={styles.dayCell}
                >
                  <View style={[styles.dayMark, today && styles.dayToday, selected && styles.daySelected]}>
                    <Text style={[styles.dayLabel, !open && styles.dayClosed, selected && styles.onAccent]}>{day.getDate()}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </AppSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  // The calendar stays in reach at the right; the days scroll out to the left screen edge.
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stripViewport: {
    flex: 1,
    marginLeft: -spacing.gutter,
  },
  strip: {
    paddingLeft: spacing.gutter,
    gap: spacing.sm,
  },
  pill: {
    minWidth: 72,
    minHeight: 88,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  pillSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pillPressed: {
    backgroundColor: colors.accentSubtle,
  },
  pillClosed: {
    backgroundColor: colors.surfaceSunken,
  },
  pillCaption: {
    ...type.caption,
    color: colors.textSecondary,
  },
  pillDay: {
    ...type.sectionTitle,
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary,
  },
  pillMore: {
    ...type.label,
    color: colors.accent,
  },
  onAccent: {
    color: colors.onAccent,
  },
  slots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  slot: {
    flexGrow: 1,
    flexBasis: '30%',
    maxWidth: '32%',
    minHeight: size.compactButton,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  slotSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  slotLabel: {
    ...type.label,
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary,
  },
  note: {
    ...type.helper,
    color: colors.textSecondary,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitle: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    ...type.caption,
    flex: 1,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  dayCell: {
    flex: 1,
    minHeight: size.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  daySelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayLabel: {
    ...type.body,
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary,
  },
  dayClosed: {
    color: colors.textMuted,
  },
});
