// @ts-nocheck -- Node built-ins are used only by this Vitest static-integration proof.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { formatNotificationLabel } from './notifications';

function source(relativePath: string): ts.SourceFile {
  const absolutePath = resolve(relativePath);
  return ts.createSourceFile(
    absolutePath,
    readFileSync(absolutePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function visit(node: ts.Node, predicate: (candidate: ts.Node) => boolean): ts.Node[] {
  const matches: ts.Node[] = [];
  const walk = (candidate: ts.Node) => {
    if (predicate(candidate)) matches.push(candidate);
    candidate.forEachChild(walk);
  };
  walk(node);
  return matches;
}

function stringLiterals(file: ts.SourceFile): string[] {
  return visit(file, ts.isStringLiteral).map((node) => (node as ts.StringLiteral).text);
}

describe('Admin notification route integration', () => {
  it('presents the trusted report type without replacing the backend message', () => {
    expect(formatNotificationLabel('report_submitted')).toBe('Report submitted');
    const list = source('src/components/notification-list.tsx');
    expect(list.getText()).toContain('{n.message}');
    expect(stringLiterals(list)).not.toContain('A new report needs Admin review.');
  });

  it('registers one Admin-protected route that renders the shared NotificationList', () => {
    const rootLayout = source('src/app/_layout.tsx');
    const adminLayout = source('src/app/(admin)/_layout.tsx');
    const route = source('src/app/(admin)/admin/notifications.tsx');

    const routeImports = visit(route, ts.isImportDeclaration).map((node) => {
      const declaration = node as ts.ImportDeclaration;
      return {
        module: (declaration.moduleSpecifier as ts.StringLiteral).text,
        defaultImport: declaration.importClause?.name?.text ?? null,
      };
    });
    const routeJsxTags = visit(
      route,
      (node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)
    ).map((node) =>
      (node as ts.JsxOpeningElement | ts.JsxSelfClosingElement).tagName.getText(route)
    );

    expect(stringLiterals(adminLayout)).toContain('admin/notifications');
    expect(routeImports).toContainEqual({
      module: '@/components/notification-list',
      defaultImport: 'NotificationList',
    });
    expect(routeJsxTags).toContain('NotificationList');

    const protectedAdminGroup = visit(rootLayout, (node) => {
      if (!ts.isJsxElement(node)) return false;
      const opening = node.openingElement;
      if (opening.tagName.getText(rootLayout) !== 'Stack.Protected') return false;
      return (
        opening.attributes.getText(rootLayout).includes("access === 'administrator'") &&
        node.getText(rootLayout).includes('name="(admin)"')
      );
    });
    expect(protectedAdminGroup).toHaveLength(1);
  });

  it('mounts shared Admin push registration and exposes the inbox from the dashboard', () => {
    const adminLayout = source('src/app/(admin)/_layout.tsx');
    const adminHome = source('src/app/(admin)/admin/index.tsx');
    const dashboard = source('src/components/admin-analytics-dashboard.tsx');

    expect(stringLiterals(adminLayout)).toContain('administrator');
    expect(adminLayout.getText()).toContain('<PushNotificationRegistration role="administrator" />');
    expect(stringLiterals(adminHome)).toContain('/admin/notifications');
    expect(stringLiterals(dashboard)).toContain('Notifications');
  });

  it('keeps notification opening separate from report lifecycle mutation', () => {
    const list = source('src/components/notification-list.tsx');
    const route = source('src/app/(admin)/admin/notifications.tsx');
    const rpcNames = visit(list, (node) => {
      if (!ts.isCallExpression(node) || node.arguments.length === 0) return false;
      return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'rpc';
    }).map((node) => {
      const first = (node as ts.CallExpression).arguments[0];
      return ts.isStringLiteral(first) ? first.text : null;
    });

    expect(rpcNames).toEqual(['mark_my_notification_read']);
    expect(route.getText()).not.toMatch(/review_report|under_review|strike|suspension/i);
    expect(stringLiterals(route)).not.toContain('/admin/report-details');
  });
});
