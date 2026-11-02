---
name: SkillMatch native
description: Existing warm native interface with an original expressive Pateros duck.
colors:
  accent: "#1C3AA6"
  accentPressed: "#142B7F"
  accentSubtle: "#E9EEFC"
  canvas: "#F7F6F3"
  surface: "#FFFFFF"
  surfaceSunken: "#EFEEEA"
  hairline: "#E1DFD9"
  controlBorder: "#7A818C"
  textPrimary: "#1B1F24"
  textSecondary: "#59606B"
  textMuted: "#636A75"
  success: "#1F7A45"
  successTint: "#E7F4EC"
  warning: "#8A5300"
  warningTint: "#FFF4DC"
  error: "#B3261E"
  errorTint: "#FCEAE8"
typography:
  screenTitle:
    fontFamily: "sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.272727
    letterSpacing: "-0.2px"
  sectionTitle:
    fontFamily: "sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.333333
  body:
    fontFamily: "sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  helper:
    fontFamily: "sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.428571
  label:
    fontFamily: "sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.428571
  button:
    fontFamily: "sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  badge:
    fontFamily: "sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.384615
rounded:
  sm: "8px"
  control: "12px"
  card: "16px"
  sheet: "24px"
  pill: "999px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  gutter: "20px"
  headerGutter: "24px"
  xl: "24px"
  xxl: "32px"
  xxxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 24px"
  button-primary-pressed:
    backgroundColor: "{colors.accentPressed}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.error}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 24px"
  button-compact:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-inverse:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 24px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.textPrimary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
  chip-selected:
    backgroundColor: "{colors.accentSubtle}"
    textColor: "{colors.accent}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px"
---

# Design System: SkillMatch native

## Overview

**Creative North Star: "Original Pateros duck within SkillMatch"**

The existing native interface combines a warm canvas, white surfaces and a single cobalt accent. The approved mascot replacement adds an original soft matte 3D cream duck with amber bill and feet and a cobalt scarf. It represents Pateros while the surrounding words continue to explain the task.

This is a record of the existing app and the completed mascot implementation, not a new screen or navigation identity. Source authority remains `src/constants/theme.ts`, `src/constants/motion.ts`, and the shared components. Portable frontmatter sizes represent React Native dp/sp at 100% text as px; native code remains authoritative for platform behavior and text scaling.

**Key Characteristics:**
- Warm, light-only surfaces with cobalt actions.
- Existing scalable native typography and generous control targets.
- Original dimensional duck cutouts with true alpha transparency, directly on the surrounding surface.
- Finite expressions with a static semantic pose when motion is reduced.

## Colors

### Primary

Cobalt `accent` identifies actions, selected navigation and informational states. `accentPressed` deepens a pressed filled action; `accentSubtle` provides a quiet selected or pressed fill.

### Secondary

Success green, warning amber and error red, with their corresponding tints, convey status. The duck's cream and amber are raster artwork materials, not additional UI accent tokens.

### Neutral

`canvas` is the warm screen background; `surface` is white; `surfaceSunken` supports disabled controls and neutral chips. `hairline` separates surfaces decoratively, while `controlBorder` outlines controls. Primary, secondary and muted inks distinguish content from support and metadata.

Sidecar tonal ramps are synthesized preview strips, not additional colors used by the native interface.

**The Status Color Rule.** Status colors explain state; cobalt remains the action accent.

## Typography

The sampled components use the platform-rendered sans: Android `sans-serif` (Roboto), iOS `System`, and `system-ui` as fallback. The frontmatter records the Android baseline. Screen titles, section titles, body, helper, label, button and badge roles retain the existing source scale. Titles use bold ink; supporting copy uses the secondary ink. System text scaling remains enabled.

The incumbent display token (28/34, weight 700) also uses the system face. This inherited display treatment is not a newly approved brand display rule; no bespoke display family was introduced by the mascot work.

## Layout

The shared rhythm is based on four units, with a two-unit title-to-supporting-line exception. Body gutters use `gutter`; the shared upper header uses `headerGutter` and a safe-area inset. Controls retain a minimum target of 48dp and fields a minimum height of 52dp; these are minima, not text-clipping fixed heights.

Home keeps a flexible greeting/name/date column and a 48dp bell slot. Greeting headers have no mascot for any user role. Whole-screen states center a scrollable column with a maximum width of 420dp; actions remain reachable as text grows. Existing role navigation and control placement remain the reference.

## Elevation & Depth

Ordinary cards and content surfaces are flat, separated by white-on-canvas layering and hairlines. Floating layers use the existing native `floating` shadow (ink, offset 0/4dp, opacity 0.14, radius 12dp, Android elevation 6); sheets use offset 0/-4dp, opacity 0.12, radius 16dp, elevation 12. The duck's rendered soft volume belongs to the illustration, not to UI container shadows.

## Shapes

Controls have rounded corners; cards are softer; sheets use the largest structural corner. Pills belong to chips, search fields and selected navigation indicators. The mascot is cropped from a three-by-three RGBA atlas with hidden overflow to isolate each pose. Exterior pixels are transparent; the wrapper adds no white fill or circular badge.

## Components

### Buttons

Primary and compact actions use cobalt with white text; outlined secondary and transparent ghost actions use cobalt text. Destructive actions use an error outline and text; inverse actions use a white fill. Primary/inverse minima are 52dp; other variants retain 48dp minima. Press feedback combines existing fills and bounded Android ripple. Disabled/loading controls block repeated action and retain accessible state; loading uses the existing dots.

### Inputs / Fields

White fields use the control outline, changing to cobalt on focus and error red for an error. Search uses a pill shape. Disabled fields use the sunken surface and secondary ink. Labels and error words remain associated with the input; a trailing control reserves a 48dp target.

### Chips

Compact noninteractive labels use pill corners, badge typography, and a 28dp minimum height. Neutral uses sunken fill; selected/information uses cobalt tint; positive, warning and danger use their corresponding status pairs.

### Cards / Containers

AppCard is a flat white surface with a hairline edge, card corners, `lg` padding and `md` content gap. It represents a self-contained object; related rows use the existing grouped surfaces.

### Navigation

Existing bottom tabs retain visible labels, minimum 48dp targets, and a cobalt selected icon pill (52 by 32dp) with white icon. Inactive icons and labels use muted ink. The white bar has a hairline upper boundary and grows with system font scale and bottom inset. The mascot does not replace navigation icons.

### Pateros duck

`SkillMatchMascot` uses the original `assets/images/mascot/pateros-duck-poses.png`; its adjacent provenance records the image generator, prompt, grid and hash. The atlas has nine cells, with runtime expressions using idle/blink, wave-high/wave-low, thinking, celebrate and concern. Sleeping and pointing cells are asset inventory, not additional shipped interaction states.

Default empty-state artwork is 96dp. Whole-screen states use 128dp: thinking while loading, celebrate for success, concern for warning/error, otherwise idle. Explicit semantic icons remain available. Skeleton loading remains skeleton loading; compact errors retain their existing presentation. Existing success placements select celebrate. The live cancellation sheet uses an 88dp concerned duck, switching to thinking while busy; cancellation-specific artwork does not extend to cancelled-history cards.

**The Words Carry State Rule.** The duck is decorative, excluded from accessibility traversal and pointer input; adjacent words and controls carry meaning and action.

**The Finite Expression Rule.** Motion starts only after image load and while active, foregrounded and route-focused; it stops and resets on blur, background, hiding, cleanup or live reduced-motion preference. Optional navigation context lets bootstrap states work outside a navigator. No action waits for animation.

Hello uses six alternating wing changes and returns to idle; idle/hello blink three times. All expressions have six finite breathing legs; celebrate adds one hop; hello/concern add a short tilt sequence. Exact timing and transform values live in the sidecar and `MotionTokens.duck`. Reduced motion retains the expression's static resting pose.

## Do's and Don'ts

### Do:
- **Do** retain the incumbent palette, type scale, controls and role navigation.
- **Do** use the original transparent duck atlas directly on the surrounding surface.
- **Do** keep semantic wording and actions readable alongside decorative artwork.
- **Do** use centralized finite motion with live reduced-motion and visibility handling.

### Don't:
- **Don't** turn the duck's amber material into a new UI brand accent.
- **Don't** replace skeletons or explicit semantic cues indiscriminately with artwork.
- **Don't** put cancellation-specific artwork on cancelled-history cards.
- **Don't** delay controls for animation or play duck motion on hidden/background routes.
