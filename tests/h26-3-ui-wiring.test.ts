// claude-2 independent H26-3 UI-wiring regressions (static TypeScript AST inspection).
// Contract: docs/H26-3-PLAN.md frozen decisions. Source files are parsed, never imported, so no
// CSS-bearing React component, Three.js scene or server/index.ts is loaded into Node.
// Analyzers follow real data flow (variables, destructuring, props) so equivalent correct wiring
// passes; synthetic fixtures at the bottom prove both equivalence acceptance and defect rejection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const APP = join(root, 'src/App.tsx');
const ARENA = join(root, 'packages/gameplay/GameArena.tsx');
const read = (f: string) => readFileSync(f, 'utf8');
const parse = (name: string, text: string) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
type ModuleReader = (fromFile: string, spec: string) => {file: string; text: string} | undefined;
const diskReader: ModuleReader = (from, spec) => {
  if (!spec.startsWith('.')) return undefined;
  const base = resolve(dirname(from), spec);
  for (const f of [base, `${base}.tsx`, `${base}.ts`]) if (existsSync(f) && /\.tsx?$/.test(f)) return {file: f, text: read(f)};
  return undefined;
};

// ---------- generic AST helpers ----------
function collect<T extends ts.Node>(node: ts.Node, pred: (n: ts.Node) => n is T): T[] {
  const out: T[] = [];
  const visit = (n: ts.Node) => { if (pred(n)) out.push(n); n.forEachChild(visit); };
  visit(node);
  return out;
}
const unwrap = (e: ts.Expression): ts.Expression => {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
};
const ancestors = (n: ts.Node) => { const a: ts.Node[] = []; for (let p = n.parent; p; p = p.parent) a.push(p); return a; };
const isWithin = (n: ts.Node, container: ts.Node) => n.pos >= container.pos && n.end <= container.end;
const tagOf = (n: ts.Node) => ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : undefined;
const tagName = (n: ts.Node) => tagOf(n)?.tagName.getText();
function attr(n: ts.Node, name: string): ts.JsxAttribute | undefined {
  return tagOf(n)?.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name);
}
function attrExpr(n: ts.Node, name: string): ts.Expression | undefined {
  const a = attr(n, name)?.initializer;
  if (!a) return undefined;
  if (ts.isStringLiteral(a)) return a;
  return ts.isJsxExpression(a) ? a.expression : undefined;
}
function classes(n: ts.Node): string[] {
  const e = attrExpr(n, 'className');
  return e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text.split(/\s+/) : [];
}
const elements = (sf: ts.Node) => collect(sf, (n): n is ts.JsxElement | ts.JsxSelfClosingElement => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n));
const byClass = (sf: ts.Node, cls: string) => elements(sf).filter(e => classes(e).includes(cls));

type Binding =
  | {kind: 'var'; decl: ts.VariableDeclaration}
  | {kind: 'bind'; decl: ts.VariableDeclaration | ts.ParameterDeclaration; prop: string}
  | {kind: 'param'; param: ts.ParameterDeclaration; index: number}
  | {kind: 'other'};
function bindingIn(name: ts.BindingName, wanted: string): string | 'self' | 'array' | undefined {
  if (ts.isIdentifier(name)) return name.text === wanted ? 'self' : undefined;
  for (const el of name.elements) {
    if (ts.isOmittedExpression(el)) continue;
    if (ts.isIdentifier(el.name) && el.name.text === wanted) {
      return ts.isObjectBindingPattern(name) ? (el.propertyName?.getText() ?? wanted) : 'array';
    }
  }
  return undefined;
}
/** Scope-aware lookup of the nearest declaration of `name` visible from `from`. */
function lookup(from: ts.Node, name: string): Binding | undefined {
  for (const a of ancestors(from)) {
    if (ts.isFunctionLike(a)) {
      for (const [index, p] of a.parameters.entries()) {
        const b = bindingIn(p.name, name);
        if (b === 'self') return {kind: 'param', param: p, index};
        if (b && b !== 'array') return {kind: 'bind', decl: p, prop: b};
        if (b) return {kind: 'other'};
      }
    }
    const stmts = ts.isBlock(a) || ts.isSourceFile(a) || ts.isModuleBlock(a) ? a.statements : undefined;
    if (!stmts) continue;
    for (const s of stmts) {
      if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) {
        const b = bindingIn(d.name, name);
        if (b === 'self') return {kind: 'var', decl: d};
        if (b === 'array') return {kind: 'other'};
        if (b) return {kind: 'bind', decl: d, prop: b};
      }
      if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name?.text === name) return {kind: 'other'};
      if (ts.isImportDeclaration(s) && s.importClause && s.importClause.getText().match(new RegExp(`\\b${name}\\b`))) return {kind: 'other'};
    }
  }
  return undefined;
}
/** Follow `const a = b` aliases to the defining expression. */
function deref(e: ts.Expression, seen = 0): ts.Expression {
  e = unwrap(e);
  if (seen > 20 || !ts.isIdentifier(e)) return e;
  const b = lookup(e, e.text);
  return b?.kind === 'var' && b.decl.initializer ? deref(b.decl.initializer, seen + 1) : e;
}
const isIdent = (e: ts.Expression, name: string) => { const u = unwrap(e); return ts.isIdentifier(u) && u.text === name; };

/** True when `e` is (an alias of) `replay?.config ?? base` or `replay ? replay.config : base`. */
function isDisplayedConfig(e: ts.Expression, replay: string, base: string): boolean {
  const d = deref(e);
  // `replay` is the terminal replay-attempt variable (App: replayAttempt, GameArena: replay prop); match its name, do not deref past it.
  const isReplay = (x: ts.Expression) => isIdent(x, replay);
  const replayConfig = (x: ts.Expression) => { const u = unwrap(x); return ts.isPropertyAccessExpression(u) && u.name.text === 'config' && isReplay(u.expression); };
  if (ts.isBinaryExpression(d) && d.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) return replayConfig(d.left) && isIdent(d.right, base);
  if (ts.isConditionalExpression(d)) return isReplay(d.condition) && replayConfig(d.whenTrue) && isIdent(d.whenFalse, base);
  return false;
}
/** True when identifier/property `e` reads field `field` from the displayed config. */
function readsDisplayedField(e: ts.Expression, field: string, replay: string, base: string): boolean {
  const u = unwrap(e);
  if (ts.isPropertyAccessExpression(u)) return u.name.text === field && isDisplayedConfig(u.expression, replay, base);
  if (!ts.isIdentifier(u)) return false;
  const b = lookup(u, u.text);
  if (b?.kind === 'var' && b.decl.initializer) return readsDisplayedField(b.decl.initializer, field, replay, base);
  return b?.kind === 'bind' && b.prop === field && ts.isVariableDeclaration(b.decl) && !!b.decl.initializer && isDisplayedConfig(b.decl.initializer, replay, base);
}

// ---------- guide provider + App wiring analysis ----------
type Provider = {sf: ts.SourceFile; component: ts.Node; call: ts.CallExpression; helper: string; prop?: string};
function helperName(sf: ts.SourceFile): string | undefined {
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || !/practice-guide(\.ts)?$/.test(s.moduleSpecifier.text)) continue;
    const named = s.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) for (const el of named.elements) if ((el.propertyName ?? el.name).text === 'practiceGuide') return el.name.text;
  }
  return undefined;
}
const callsTo = (sf: ts.Node, fn: string) => collect(sf, (n): n is ts.CallExpression => ts.isCallExpression(n) && isIdent(n.expression, fn));
function exportedComponent(sf: ts.SourceFile, imported: 'default' | string): ts.Node | undefined {
  for (const s of sf.statements) {
    const mods = ts.canHaveModifiers(s) ? ts.getModifiers(s) ?? [] : [];
    const isDefault = mods.some(m => m.kind === ts.SyntaxKind.DefaultKeyword), isExport = mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(s) && isExport && (imported === 'default' ? isDefault : s.name?.text === imported)) return s;
    if (ts.isExportAssignment(s) && imported === 'default') {
      const e = unwrap(s.expression);
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return e;
      if (ts.isIdentifier(e)) return sf.statements.find(x => ts.isFunctionDeclaration(x) && x.name?.text === e.text)
        ?? sf.statements.filter(ts.isVariableStatement).flatMap(v => v.declarationList.declarations).find(d => isIdent(d.name as ts.Expression, e.text))?.initializer;
    }
    if (ts.isVariableStatement(s) && isExport && imported !== 'default') {
      const d = s.declarationList.declarations.find(x => ts.isIdentifier(x.name) && x.name.text === imported);
      if (d?.initializer) return d.initializer;
    }
  }
  return undefined;
}
/** Which prop of the component feeds practiceGuide(...)? Undefined if it is not a prop. */
function propFeeding(arg: ts.Expression, component: ts.Node, seen = 0): string | undefined {
  const u = unwrap(arg);
  if (seen > 20) return undefined;
  const first = ts.isFunctionLike(component) ? component.parameters[0] : undefined;
  if (!first) return undefined;
  if (ts.isPropertyAccessExpression(u)) {
    const b = ts.isIdentifier(u.expression) ? lookup(u.expression, u.expression.text) : undefined;
    return b?.kind === 'param' && b.param === first ? u.name.text : undefined;
  }
  if (!ts.isIdentifier(u)) return undefined;
  const b = lookup(u, u.text);
  if (b?.kind === 'bind' && b.decl === first) return b.prop;
  if (b?.kind === 'var' && b.decl.initializer) return propFeeding(b.decl.initializer, component, seen + 1);
  return undefined;
}
function findProviders(appFile: string, app: ts.SourceFile, readModule: ModuleReader): Map<string, Provider> {
  const out = new Map<string, Provider>();
  for (const s of app.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || !s.importClause) continue;
    const mod = readModule(appFile, s.moduleSpecifier.text);
    if (!mod) continue;
    const sf = parse(mod.file, mod.text);
    const helper = helperName(sf);
    if (!helper) continue;
    const imports: Array<[string, string]> = [];
    if (s.importClause.name) imports.push([s.importClause.name.text, 'default']);
    const nb = s.importClause.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) imports.push([el.name.text, (el.propertyName ?? el.name).text]);
    for (const [local, exported] of imports) {
      const component = exportedComponent(sf, exported);
      const call = component && callsTo(component, helper)[0];
      if (component && call) out.set(local, {sf, component, call, helper, prop: call.arguments[0] && propFeeding(call.arguments[0], component)});
    }
  }
  return out;
}
type Usage = {node: ts.Node; configExpr?: ts.Expression; via: string};
function guideUsages(app: ts.SourceFile, providers: Map<string, Provider>): Usage[] {
  const uses: Usage[] = [];
  for (const el of elements(app)) {
    const p = providers.get(tagName(el) ?? '');
    if (p) uses.push({node: el, configExpr: p.prop ? attrExpr(el, p.prop) : undefined, via: `<${tagName(el)} ${p.prop ?? '?'}=…>`});
  }
  const direct = helperName(app);
  if (direct) for (const call of callsTo(app, direct)) {
    let node: ts.Node = call;
    const inJsx = ancestors(call).some(a => ts.isJsxExpression(a));
    if (!inJsx) { // locate where the result is rendered
      const holder = ancestors(call).find(ts.isVariableDeclaration);
      const names = holder ? collect(holder.name, ts.isIdentifier).map(i => i.text) : [];
      const ref = collect(app, ts.isIdentifier).find(i => names.includes(i.text) && ancestors(i).some(a => ts.isJsxExpression(a)));
      if (ref) node = ref;
    }
    uses.push({node, configExpr: call.arguments[0], via: `${direct}(…)`});
  }
  return uses;
}
function replayPropOf(app: ts.SourceFile, playLayout: ts.Node): string | undefined {
  const arena = elements(playLayout).find(e => tagName(e) === 'GameArena');
  const r = arena && attrExpr(arena, 'replay');
  return r && ts.isIdentifier(unwrap(r)) ? (unwrap(r) as ts.Identifier).text : undefined;
}
function analyzeApp(appFile: string, appText: string, readModule: ModuleReader) {
  const app = parse(appFile, appText);
  const providers = findProviders(appFile, app, readModule);
  const uses = guideUsages(app, providers);
  const layouts = byClass(app, 'play-layout');
  const errors: string[] = [];
  if (layouts.length !== 1) errors.push(`expected one .play-layout, found ${layouts.length}`);
  const layout = layouts[0];
  const replay = layout ? replayPropOf(app, layout) : undefined;
  if (!replay) errors.push('play-layout GameArena has no identifier replay prop');
  if (uses.length !== 1) errors.push(`expected the guide exactly once, found ${uses.length}`);
  for (const u of uses) {
    const anc = ancestors(u.node);
    if (!layout || !isWithin(u.node, layout)) errors.push(`${u.via} is outside .play-layout`);
    if (anc.some(a => tagName(a) === 'GameArena' || classes(a).includes('game-arena'))) errors.push(`${u.via} is inside the clipped game arena`);
    for (const a of anc) {
      const premiere = (cond: ts.Node) => /['"`]premiere['"`]/.test(cond.getText());
      if (ts.isConditionalExpression(a) && isWithin(u.node, a.whenTrue) && premiere(a.condition)) errors.push(`${u.via} is in a premiere branch`);
      if (ts.isBinaryExpression(a) && a.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && isWithin(u.node, a.right) && premiere(a.left)) errors.push(`${u.via} is gated on premiere`);
    }
    if (!u.configExpr) errors.push(`${u.via}: helper is not fed from a component prop/argument`);
    else if (!replay || !isDisplayedConfig(u.configExpr, replay, 'config')) errors.push(`${u.via}: config is not ${replay ?? 'replay'}?.config ?? config (got ${u.configExpr.getText()})`);
  }
  // Arena topbar names the displayed (replay) arena.
  const topbars = layout ? byClass(layout, 'arena-topbar') : [];
  if (topbars.length !== 1) errors.push(`expected one .arena-topbar in play layout, found ${topbars.length}`);
  for (const bar of topbars) {
    const reads = collect(bar, ts.isPropertyAccessExpression).filter(p => ['game', 'title'].includes(p.name.text));
    if (!reads.length) errors.push('topbar shows no arena game/title');
    for (const r of reads) {
      let src = deref(r.expression);
      if (ts.isBinaryExpression(src) && src.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) src = deref(src.left);
      if (ts.isNonNullExpression(src)) src = unwrap(src);
      const ok = ts.isCallExpression(src) && collect(src, ts.isPropertyAccessExpression).some(p => p.name.text === 'arenaId' && !!replay && isDisplayedConfig(p.expression, replay, 'config'));
      if (!ok) errors.push(`topbar ${r.getText()} is not derived from the displayed config arenaId`);
    }
  }
  return {errors, uses, providers};
}

// ---------- provider markup analysis ----------
function fromGuide(e: ts.Expression, field: string, helper: string): boolean {
  const u = unwrap(e);
  const isCall = (x?: ts.Expression) => !!x && ts.isCallExpression(deref(x)) && isIdent((deref(x) as ts.CallExpression).expression, helper);
  if (ts.isPropertyAccessExpression(u)) return u.name.text === field && isCall(u.expression);
  if (!ts.isIdentifier(u)) return false;
  const b = lookup(u, u.text);
  return b?.kind === 'bind' && b.prop === field && ts.isVariableDeclaration(b.decl) && isCall(b.decl.initializer);
}
function analyzeMarkup(p: Provider) {
  const errors: string[] = [];
  const els = elements(p.component);
  const mapsField = (list: ts.Node, field: string) => collect(list, ts.isCallExpression).some(c =>
    ts.isPropertyAccessExpression(c.expression) && c.expression.name.text === 'map' && fromGuide(c.expression.expression, field, p.helper) &&
    elements(c).some(e => tagName(e) === 'li'));
  const stepsList = els.find(e => tagName(e) === 'ol' && mapsField(e, 'steps'));
  const controlsList = els.find(e => ['ul', 'ol'].includes(tagName(e) ?? '') && mapsField(e, 'controls'));
  const heading = els.find(e => /^h[1-6]$/.test(tagName(e) ?? '') && collect(e, (n): n is ts.JsxExpression => ts.isJsxExpression(n)).some(x => !!x.expression && fromGuide(x.expression, 'title', p.helper)));
  if (!stepsList) errors.push('steps are not rendered as <ol><li> from practiceGuide().steps');
  if (!controlsList) errors.push('controls are not rendered as a list of <li> from practiceGuide().controls');
  if (!heading) errors.push('guide title is not rendered in a heading');
  if (heading && stepsList && controlsList && !(heading.pos < stepsList.pos && stepsList.pos < controlsList.pos)) errors.push('expected order: title heading, ordered steps, controls');
  if (controlsList && stepsList) {
    const labelled = attr(controlsList, 'aria-label') || attr(controlsList, 'aria-labelledby') ||
      els.some(e => /^h[2-6]$/.test(tagName(e) ?? '') && e.pos > stepsList.end && e.end <= controlsList.pos);
    if (!labelled) errors.push('controls list has no heading or accessible label');
  }
  const region = heading && els.find(e => isWithin(heading, e) && e !== heading && ['section', 'aside', 'nav'].includes(tagName(e) ?? ''));
  if (!region) errors.push('guide is not wrapped in a section/aside landmark');
  else {
    const lb = attrExpr(region, 'aria-labelledby'), hid = heading && attrExpr(heading, 'id'), al = attrExpr(region, 'aria-label');
    const named = (lb && hid && lb.getText() === hid.getText()) || (al && (!ts.isStringLiteral(al) || al.text.trim()));
    if (!named) errors.push('guide landmark is not named by its heading (aria-labelledby = heading id) or aria-label');
  }
  const text = p.component.getText();
  if (/[✓✔☑]|aria-checked|type=["']checkbox|role=["'](?:checkbox|progressbar)/.test(text)) errors.push('guide renders a completion indicator');
  return errors;
}

// ---------- tiny evaluator for HUD wording ----------
type Env = Record<string, unknown>;
function evaluate(e: ts.Expression, env: Env, depth = 0): unknown {
  if (depth > 40) throw new Error('evaluation too deep');
  const u = unwrap(e);
  if (ts.isStringLiteral(u) || ts.isNoSubstitutionTemplateLiteral(u)) return u.text;
  if (ts.isNumericLiteral(u)) return Number(u.text);
  if (u.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (u.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isTemplateExpression(u)) return u.head.text + u.templateSpans.map(s => String(evaluate(s.expression, env, depth + 1)) + s.literal.text).join('');
  if (ts.isConditionalExpression(u)) return evaluate(u.condition, env, depth + 1) ? evaluate(u.whenTrue, env, depth + 1) : evaluate(u.whenFalse, env, depth + 1);
  if (ts.isPrefixUnaryExpression(u) && u.operator === ts.SyntaxKind.ExclamationToken) return !evaluate(u.operand, env, depth + 1);
  if (ts.isBinaryExpression(u)) {
    const k = u.operatorToken.kind, l = () => evaluate(u.left, env, depth + 1), r = () => evaluate(u.right, env, depth + 1);
    if (k === ts.SyntaxKind.EqualsEqualsEqualsToken) return l() === r();
    if (k === ts.SyntaxKind.ExclamationEqualsEqualsToken) return l() !== r();
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) return l() && r();
    if (k === ts.SyntaxKind.BarBarToken) return l() || r();
    if (k === ts.SyntaxKind.QuestionQuestionToken) return l() ?? r();
  }
  if (ts.isIdentifier(u)) {
    const b = lookup(u, u.text);
    if (b?.kind === 'var' && b.decl.initializer) return evaluate(b.decl.initializer, env, depth + 1);
    if (b?.kind === 'bind' && b.prop in env) return env[b.prop];
    if (u.text in env) return env[u.text];
  }
  throw new Error(`cannot statically evaluate ${u.getText()}`);
}
function qeHint(arenaText: string, env: Env): string {
  const sf = parse('GameArena.tsx', arenaText);
  const controls = byClass(sf, 'game-controls');
  assert.equal(controls.length, 1, 'one .game-controls hint row');
  const span = elements(controls[0]).find(e => tagName(e) === 'span' && elements(e).some(k => tagName(k) === 'kbd' && /Q\s*\/\s*E/i.test(k.getText())));
  assert.ok(span && ts.isJsxElement(span), 'Q/E hint span exists');
  return span.children.map(c => ts.isJsxText(c) ? c.text : ts.isJsxExpression(c) && c.expression ? String(evaluate(c.expression, env)) : '').join(' ').trim();
}
function objectiveErrors(arenaText: string): string[] {
  const sf = parse('GameArena.tsx', arenaText);
  const errors: string[] = [];
  const obj = byClass(sf, 'game-objective');
  if (obj.length !== 1) return [`expected one .game-objective, found ${obj.length}`];
  const fnc = ancestors(obj[0]).find(ts.isFunctionLike);
  const replay = fnc && ts.isFunctionLike(fnc) && fnc.parameters[0] && ts.isObjectBindingPattern(fnc.parameters[0].name)
    && fnc.parameters[0].name.elements.some(el => el.name.getText() === 'replay') ? 'replay' : undefined;
  if (!replay) errors.push('GameArena has no replay prop');
  const reads = collect(obj[0], (n): n is ts.Expression => (ts.isIdentifier(n) && n.text === 'targetDistance' && !ts.isPropertyAccessExpression(n.parent)) || (ts.isPropertyAccessExpression(n) && n.name.text === 'targetDistance'));
  if (!reads.length) errors.push('objective shows no target distance');
  for (const r of reads) if (!replay || !readsDisplayedField(r, 'targetDistance', replay, 'config')) errors.push(`objective distance ${r.getText()} is not from replay?.config ?? config`);
  return errors;
}

// ================= tests against the actual candidate =================
test('App -> guide component -> practiceGuide uses replayAttempt?.config ?? config, once, in play layout only', () => {
  const {errors, uses, providers} = analyzeApp(APP, read(APP), diskReader);
  assert.deepEqual(errors, []);
  assert.equal(uses.length, 1);
  for (const p of providers.values()) assert.ok(p.prop, 'provider feeds the helper from a prop');
});

test('guide component renders ordered, labelled, honest markup', () => {
  const {providers} = analyzeApp(APP, read(APP), diskReader);
  assert.ok(providers.size >= 1, 'App renders a component that calls practiceGuide');
  for (const p of providers.values()) assert.deepEqual(analyzeMarkup(p), [], p.sf.fileName);
});

test('GameArena does not render the guide inside the clipped arena; its objective uses the displayed config distance', () => {
  const text = read(ARENA);
  assert.equal(helperName(parse(ARENA, text)), undefined, 'GameArena does not call practiceGuide');
  assert.doesNotMatch(text, /PracticeGuide/);
  assert.deepEqual(objectiveErrors(text), []);
});

test('tactical HUD Q/E hint says turn, never spin; other arenas still describe the control', () => {
  const text = read(ARENA);
  for (const templateId of ['precision', 'dash-peek']) {
    const hint = qeHint(text, {arenaId: 'tactical-v1', templateId, requiredSpinDegrees: 0, targetDistance: 14});
    assert.match(hint, /\bturn\b/i, templateId);
    assert.doesNotMatch(hint, /spin|rotat|°/i, templateId);
  }
  for (const [arenaId, templateId] of [['rooftop-v1', 'spin180'], ['buildyard-v1', 'ramp-shot']]) {
    assert.match(qeHint(text, {arenaId, templateId, requiredSpinDegrees: 0, targetDistance: 14}), /\b(turn|spin)\b/i);
  }
});

test('old generic THE PLAYBOOK copy is gone from rendered UI source', () => {
  const walk = (d: string): string[] => readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  for (const f of [...walk(join(root, 'src')), ...walk(join(root, 'packages'))].filter(f => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))) {
    const sf = parse(f, read(f));
    const strings = collect(sf, (n): n is ts.Node => ts.isJsxText(n) || ts.isStringLiteralLike(n)).map(n => n.getText());
    assert.ok(!strings.some(s => /\bplaybook\b/i.test(s)), `${f} still renders playbook copy`);
    assert.ok(!strings.some(s => /Jump, spin and land your sniper shot|Build your version of the reference moment/.test(s)), `${f} keeps old generic tip`);
    assert.equal(byClass(sf, 'tip-panel').length, 0, `${f} still renders .tip-panel`);
  }
});

// ================= synthetic fixtures: equivalence accepted, defects rejected =================
const APP_SHELL = (imports: string, decls: string, guide: string, topbar = '{shownArena.game} / {shownArena.title}', premiere = '') => `
import { useState } from 'react';
import { ARENAS } from '../shared/contracts';
${imports}
export default function App() {
  const [config, setConfig] = useState(DEFAULT);
  const [screen] = useState('arena');
  const replayAttempt = pick();
  const arenaInfo = ARENAS.find(a => a.id === config.arenaId)!;
  ${decls}
  return <main>{screen === 'premiere' ? <div className="premiere">${premiere}</div> : (
    <div className="play-layout"><section className="play-column">
      <div className="arena-topbar"><span>LIVE</span><span>${topbar}</span></div>
      <GameArena config={config} replay={replayAttempt} />
      ${guide}
    </section></div>)}</main>;
}`;
const GOOD_DECLS = `const shown = replayAttempt?.config ?? config; const shownArena = ARENAS.find(a => a.id === shown.arenaId) ?? arenaInfo;`;
const COMPONENT_PROPS = `import { practiceGuide as guideFor } from './practice-guide';
export default function Guide(props) { const g = guideFor(props.challenge); const label = 'x';
  return <aside aria-labelledby={label}><h3 id={label}>{g.title}</h3><ol>{g.steps.map(s => <li key={s}>{s}</li>)}</ol>
  <ul aria-label="Controls">{g.controls.map(c => <li key={c}>{c}</li>)}</ul></aside>; }`;
const fakeReader = (mods: Record<string, string>): ModuleReader => (_from, spec) => mods[spec] === undefined ? undefined : {file: `${spec}.tsx`, text: mods[spec]};
const run = (app: string, mods: Record<string, string> = {}) => analyzeApp('/x/src/App.tsx', app, fakeReader(mods));

test('fixture: equivalent wiring passes (renamed prop, props.x access, conditional replay form, direct helper call)', () => {
  const viaComponent = run(APP_SHELL(`import Guide from './Guide';`, GOOD_DECLS, '<Guide challenge={shown} />'), {'./Guide': COMPONENT_PROPS});
  assert.deepEqual(viaComponent.errors, []);
  assert.deepEqual(analyzeMarkup([...viaComponent.providers.values()][0]), []);
  const inlineConditional = run(APP_SHELL(`import Guide from './Guide';`, GOOD_DECLS, '<Guide challenge={replayAttempt ? replayAttempt.config : config} />'), {'./Guide': COMPONENT_PROPS});
  assert.deepEqual(inlineConditional.errors, []);
  const direct = run(APP_SHELL(`import { practiceGuide } from '../packages/challenges/practice-guide';`, GOOD_DECLS, '<ol>{practiceGuide(shown).steps.map(s => <li>{s}</li>)}</ol>'));
  assert.deepEqual(direct.errors, []);
});

test('fixture: wiring defects are rejected', () => {
  const mods = {'./Guide': COMPONENT_PROPS};
  const imp = `import Guide from './Guide';`;
  const has = (r: {errors: string[]}, re: RegExp) => assert.ok(r.errors.some(e => re.test(e)), r.errors.join(' | ') || 'no errors');
  has(run(APP_SHELL(imp, GOOD_DECLS, '<Guide challenge={config} />'), mods), /not replayAttempt\?\.config/);
  has(run(APP_SHELL(imp, GOOD_DECLS, '<Guide challenge={shown} /><Guide challenge={shown} />'), mods), /exactly once/);
  has(run(APP_SHELL(imp, GOOD_DECLS, '<Guide challenge={shown} />', undefined, '<Guide challenge={shown} />'), mods), /exactly once|premiere|outside/);
  has(run(APP_SHELL(imp, GOOD_DECLS, '<Guide challenge={shown} />', '{arenaInfo.game} / {arenaInfo.title}'), mods), /topbar/);
  const ignoresProp = COMPONENT_PROPS.replace('guideFor(props.challenge)', 'guideFor(DEFAULT_CONFIG)');
  has(run(APP_SHELL(imp, GOOD_DECLS, '<Guide challenge={shown} />'), {'./Guide': ignoresProp}), /not fed from a component prop/);
  const unordered = run(APP_SHELL(imp, GOOD_DECLS, '<Guide challenge={shown} />'), {'./Guide': COMPONENT_PROPS.replace('<ol>', '<div>').replace('</ol>', '</div>').replace('</ul></aside>', '</ul><span>✓</span></aside>')});
  const markup = analyzeMarkup([...unordered.providers.values()][0]);
  assert.ok(markup.some(e => /<ol>/.test(e)) && markup.some(e => /completion/.test(e)), markup.join(' | '));
});

test('fixture: GameArena objective/HUD defects are rejected and equivalents pass', () => {
  const arena = (objective: string, hint: string, extra = '') => `export default function GameArena({config, replay}) {
    const playConfig = replay?.config ?? config; const {arenaId, targetDistance} = playConfig; const tactical = arenaId === 'tactical-v1'; ${extra}
    return <section className="game-arena"><div className="game-objective"><span>${objective}m target</span></div>
    <div className="game-controls"><span><kbd>Q / E</kbd> ${hint}</span></div></section>; }`;
  assert.deepEqual(objectiveErrors(arena('{targetDistance}', `{tactical ? 'turn' : 'spin'}`)), []);
  assert.deepEqual(objectiveErrors(arena('{shown.targetDistance}', 'turn', 'const shown = playConfig;')), []);
  assert.ok(objectiveErrors(arena('{config.targetDistance}', 'turn')).length > 0);
  const env = {arenaId: 'tactical-v1'};
  assert.match(qeHint(arena('{targetDistance}', `{!tactical ? 'spin' : 'turn'}`), env), /\bturn\b/);
  assert.match(qeHint(arena('{targetDistance}', 'turn'), env), /\bturn\b/);
  assert.match(qeHint(arena('{targetDistance}', 'spin'), env), /spin/, 'literal spin is detected (and would fail the real test)');
});
