// @ts-expect-error -- Node-only harness; Expo app omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
// @ts-expect-error -- Node-only harness.
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Props = Record<string, any>;
const flatten = (style: any): Props => Array.isArray(style)
  ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : style || {};
const read = (file: string): string => readFileSync(file, 'utf8');
const ast = (file: string) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodes(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const result: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); }
  visit(root);
  return result;
}

function harness() {
  const jsx = (type: unknown, props: Props) => ({ type, props });
  const native = { StyleSheet: { create: (styles: Props) => styles, hairlineWidth: 1 },
    Platform: { select: (values: Props) => values.android ?? values.default },
    Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator' };
  const compile = (source: string, modules: Props = {}, context: Props = {}) => {
    const exports: Props = {};
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    runInNewContext(code, { ...context, exports, require: (name: string) => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => modules['@/constants/theme'].SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: any) => children };
      if (!(name in modules)) throw Error(`Unexpected import: ${name}`);
      return modules[name];
    } });
    return exports;
  };
  const theme = compile(read('src/constants/theme.ts'), { 'react-native': native, '@/global.css': {} });
  const { AppButton } = compile(read('src/components/app-button.tsx'), {
    'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/constants/theme': theme,
    '@/components/app-symbol': { AppSymbol: 'SymbolView' },
  });
  // Execute actual source style declarations and selected JSX at the control seam.
  // No effects, services, sessions or chat lifecycle are executed by this harness.
  const styles = (file: string): Props => {
    const source = ast(file);
    const declarations = nodes(source, node => ts.isVariableDeclaration(node) && node.name.getText(source) === 'styles') as ts.VariableDeclaration[];
    const declaration = declarations.find(node => node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === 'StyleSheet.create')!;
    return compile(`export const styles = ${declaration.initializer!.getText(source)};`, {},
      { ...theme.SkillMatchTheme.ui, StyleSheet: native.StyleSheet }).styles;
  };
  const button = (file: string, styleName: string, context: Props) => {
    const source = ast(file);
    const selected = nodes(source, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'AppButton'
      && node.attributes.properties.some(attribute => attribute.getText(source) === `style={styles.${styleName}}`))[0];
    const result = compile(`export const element = (${selected.getText(source)});`,
      { 'react/jsx-runtime': { jsx, jsxs: jsx } }, { AppButton, styles: styles(file), ...context });
    return { props: result.element.props, control: AppButton(result.element.props) };
  };
  const faqInteraction = () => {
    const state: any[] = [];
    let cursor = 0;
    const useState = (initial: any) => {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (next: any) => {
        state[index] = typeof next === 'function' ? next(state[index]) : next;
      }];
    };
    const knowledge = compile(read('src/lib/faq.ts'));
    const { default: FaqChatbot } = compile(read('src/components/faq-chatbot.tsx'), {
      react: { useState },
      'react-native': { ...native, View: 'View', ScrollView: 'ScrollView' },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      '@/constants/theme': theme, '@/lib/faq': knowledge,
      '@/components/app-button': { AppButton },
      '@/components/app-chip': { AppChip: 'AppChip' },
      '@/components/app-field': { AppField: 'AppField' },
    });
    const render = () => { cursor = 0; return FaqChatbot(); };
    const find = (tree: any, predicate: (element: any) => boolean): any => {
      if (Array.isArray(tree)) {
        for (const child of tree) { const result = find(child, predicate); if (result) return result; }
      } else if (tree && typeof tree === 'object') {
        if (predicate(tree)) return tree;
        return find(tree.props?.children, predicate);
      }
    };
    const initial = render();
    const topic = find(initial, element => element.type === 'Pressable');
    expect(topic).toBeDefined();
    topic.props.onPress();
    const tree = render();
    const choice = find(tree, element => element.type === AppButton && element.props.variant === 'ghost');
    expect(choice).toBeDefined();
    const entry = knowledge.FAQ_ENTRIES.find((item: Props) => item.question === choice.props.label);
    expect(entry).toBeDefined();
    const parent = find(tree, element => element.type === 'View'
      && flatten(element.props.style).backgroundColor === theme.SkillMatchTheme.ui.colors.surfaceSunken
      && find(element.props.children, child => child === choice));
    expect(parent).toBeDefined();
    return { choice, control: AppButton(choice.props), entry, render, find,
      parentStyle: flatten(parent.props.style),
      ui: theme.SkillMatchTheme.ui };
  };
  return { styles, button, faqInteraction, size: theme.SkillMatchTheme.ui.size };
}
const booking = 'src/components/booking-chat.tsx';
const faq = 'src/components/faq-chatbot.tsx';

describe('Booking Chat Send compatibility', () => {
  it('keeps Send name stable and exposes loading while preserving draft/send blocking', () => {
    const h = harness();
    const handleSend = vi.fn();
    for (const isSending of [false, true]) for (const isDraftSendable of [false, true]) {
      const { props, control } = h.button(booking, 'sendButton', { isSending, isDraftSendable, handleSend });
      expect(props.label).toBe('Send');
      expect(props.accessibilityLabel).toBe('Send');
      expect(props.loading).toBe(isSending);
      expect(props.disabled).toBe(!isDraftSendable || isSending);
      expect(props.onPress).toBe(handleSend);
      expect(control.props.accessibilityLabel).toBe('Send');
      expect(control.props.accessibilityState).toEqual({ disabled: !isDraftSendable || isSending, busy: isSending });
      expect(control.props.children.type).toBe(isSending ? 'ActivityIndicator' : 'Text');
      if (!control.props.disabled) control.props.onPress();
    }
    expect(handleSend).toHaveBeenCalledTimes(1);
  });
  it('lets the Send control grow and preserves the 120 editing viewport', () => {
    const h = harness();
    const styles = h.styles(booking);
    expect(styles.sendButton.height).toBeUndefined();
    const { control } = h.button(booking, 'sendButton', { isSending: false, isDraftSendable: true, handleSend: vi.fn() });
    expect(flatten(control.props.style({ pressed: false })).minHeight).toBe(52);
    expect(flatten(control.props.style({ pressed: false })).height).toBeUndefined();
    expect(styles.composerInput.maxHeight).toBe(120);
  });
});

describe('FAQ presentation-only Ask compatibility', () => {
  it('lets Ask use the primary growing minimum and preserves its submit/disable path', () => {
    const h = harness();
    expect(h.styles(faq).askButton.height).toBeUndefined();
    for (const canAsk of [false, true]) {
      const ask = vi.fn();
      const { props, control } = h.button(faq, 'askButton', { FAQ_COPY: { ask: 'Ask' }, canAsk, input: 'Question', ask });
      expect(props.label).toBe('Ask');
      expect(props.accessibilityLabel).toBe('Ask');
      expect(props.disabled).toBe(!canAsk);
      expect(flatten(control.props.style({ pressed: false })).minHeight).toBe(52);
      expect(flatten(control.props.style({ pressed: false })).height).toBeUndefined();
      expect(control.props.children.props.numberOfLines).toBeUndefined();
      if (!control.props.disabled) control.props.onPress();
      expect(ask).toHaveBeenCalledTimes(canAsk ? 1 : 0);
      if (canAsk) expect(ask).toHaveBeenCalledWith('Question');
    }
  });
  it('permits constrained composer reflow while retaining the field flex layout', () => {
    const styles = harness().styles(faq);
    expect(styles.composer.flexWrap).toBe('wrap');
    expect(styles.composerField.flex).toBe(1);
    expect(styles.askButton.flexShrink).toBe(1);
    expect(styles.askButton.maxWidth).toBe('100%');
  });
  it('retains a nonzero field width so a constrained composer can actually wrap', () => {
    const styles = harness().styles(faq);
    expect(styles.composerField.minWidth).toBe(52);
    expect(styles.composerField.flex).toBe(1);
  });
});


describe('FAQ answer-choice composed feedback', () => {
  it('shows selected feedback while pressed and restores the resting choice without changing geometry', () => {
    const h = harness();
    const { choice, control, parentStyle, ui } = h.faqInteraction();
    expect(choice.props.variant).toBe('ghost');
    expect(control.props.disabled).toBe(false);
    const resting = flatten(control.props.style({ pressed: false }));
    const pressed = flatten(control.props.style({ pressed: true }));
    expect(pressed.backgroundColor).toBe(ui.colors.accentSubtle);
    expect(pressed.backgroundColor).not.toBe(resting.backgroundColor);
    expect(flatten(control.props.style({ pressed: false }))).toEqual(resting);
    for (const presentation of [resting, pressed]) {
      expect(presentation).toMatchObject({ alignSelf: 'flex-start', maxWidth: '100%',
        minHeight: 48, minWidth: 48, borderRadius: ui.radius.pill,
        paddingVertical: ui.spacing.sm, paddingHorizontal: ui.spacing.md });
      expect(presentation.height).toBeUndefined();
    }
    expect(control.props.children.props.numberOfLines).toBeUndefined();
    const labelColor = flatten(control.props.children.props.style).color;
    const luminance = (color: string) => {
      const values = color.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const contrast = (background: string) => {
      const a = luminance(labelColor), b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const restBackground = resting.backgroundColor === 'transparent'
      ? parentStyle.backgroundColor : resting.backgroundColor;
    expect(restBackground).toBe(ui.colors.surfaceSunken);
    expect(contrast(restBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(pressed.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    console.log('F1 composed contrast', JSON.stringify({ labelColor, restBackground,
      pressedBackground: pressed.backgroundColor, restingRatio: contrast(restBackground),
      pressedRatio: contrast(pressed.backgroundColor) }));
  });
  it('keeps the real choice question, accessible name and fixed answer callback', () => {
    const { choice, control, entry, render, find } = harness().faqInteraction();
    expect(choice.props.label).toBe(entry.question);
    expect(choice.props.accessibilityLabel).toBe(entry.question);
    expect(control.props.accessibilityLabel).toBe(entry.question);
    expect(control.props.onPress).toBe(choice.props.onPress);
    control.props.onPress();
    const tree = render();
    expect(find(tree, element => element.type === 'Text' && element.props.children === entry.question)).toBeDefined();
    expect(find(tree, element => element.type === 'Text' && element.props.children === entry.answer)).toBeDefined();
  });
});

describe('Unchanged lifecycle/resolver and token consumer contracts', () => {
  const fingerprints = {
    handleSend: 'eac3d0defc5a45ebec6d31c7b73efeee093b054001c7c119666f81c8bc536bd7',
    append: '664025bce50f4063bdeca5872c16587f8123670a07cc559803637a4256f247d9',
    botAnswer: 'b47b5bc37a1fe22341214204b15008e776dbd4d32dbce629a4d3b86fd3592809',
    botChoices: 'c37af3c366fef950265b9ad2312b305f89dfe0649a9a91e270853bed7181617b',
    ask: '6add83400f266142d9e6e219da1b2a8711fcfee06343ae738f8719d90e51de3e',
    pick: 'b2a14d9bcbda4e2d4424e6b69d4784927050038bca4445509dd8304abe82f371',
    topic: '0c74c5f940a3ca609dd3151a5418d9f8e809313fef46e65afa1d1ecbbe74052c',
  };
  it('retains the accepted Send lifecycle and FAQ callback bodies exactly', () => {
    for (const [name, hash] of Object.entries(fingerprints)) {
      const source = ast(name === 'handleSend' ? booking : faq);
      const fn = nodes(source, node => ts.isFunctionDeclaration(node) && node.name?.text === name)[0];
      expect(createHash('sha256').update(fn.getText(source).replace(/\r\n/g, '\n')).digest('hex'), name).toBe(hash);
    }
  });
  it('preserves FAQ field submission props and transcript ordering declarations', () => {
    const source = read(faq);
    expect(source).toContain('onSubmitEditing={() => ask(input)}');
    expect(source).toContain('maxLength={MAX_QUERY_LENGTH}');
    expect(source).toContain('containerStyle={styles.composerField}');
    expect(source).toContain('const [lines, setLines] = useState<Line[]>([');
    expect(source).toContain('const [nextKey, setNextKey] = useState(1);');
  });
  it('constructs known ghost/secondary token consumer styles without changing their sources', () => {
    const h = harness();
    expect(h.size).toMatchObject({ ghostButton: 48, secondaryButton: 48, searchHeight: 52, compactButton: 48 });
    for (const [file, token] of [
      ['src/components/selected-skill-chips.tsx', 'ghostButton'],
      ['src/components/legal-document-screen.tsx', 'ghostButton'],
      ['src/components/client-post-job-screen.tsx', 'ghostButton'],
    ]) {
      const constructed = h.styles(file);
      const uses = nodes(ast(file), node => ts.isPropertyAssignment(node) && node.initializer.getText() === `size.${token}`);
      expect(uses.length, file).toBeGreaterThan(0);
      expect(Object.values(constructed).filter((style: any) => style.minHeight === h.size[token]).length, file).toBeGreaterThan(0);
    }
  });
});
