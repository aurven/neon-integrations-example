# Port render Fixes to web/ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port two render-branch commits' logic into the already-ported TypeScript modules on `develop` — `hasWorkflow` skip-transitions guard, per-story filename/workfolder/type overrides, print metadata fields, and the delayed-importer `type`→`contentType` payload rename — so `web/` doesn't silently regress behind `render`'s current state for the modules it has already migrated.

**Architecture:** No new modules. Four already-ported files get targeted edits mirroring render's JS diffs exactly, translated to this codebase's existing TS types/test conventions: `lib/core/neon-utils.ts`, `lib/core/utils.ts`, `lib/integrations/populator/service.ts`, `lib/integrations/delayed-importer/service.ts`. Each gets matching test updates in its sibling `__tests__/` file.

**Tech Stack:** TypeScript, Vitest (existing `web/` test runner — `cd web && npx vitest run`).

## Global Constraints

- **Source of truth:** render commits `555471c` ("Skip workflow transitions for nodes without an associated workflow") and `fdaff75`'s `src/helpers/utils.js` hunk only ("New helpers for passage from Neon to Méthode" — the `src/neon-to-methode.js` portion of that commit is NOT ported, Méthode integration doesn't exist in `web/` yet). Every task below already states the exact resulting code — this is a faithful port, not a redesign; don't deviate from the logic even where TS idiom might tempt a different shape.
- **Work happens in the existing worktree** at `/Users/aureliano.ventrella/Repos/neon-integrations-example/.claude/worktrees/develop` (branch `develop`, already checked out — do NOT create a new worktree, do NOT run `git worktree add`). All file paths below are relative to that worktree's root. `cd` there before running any command.
- Run `cd web && npx vitest run` after every task — full suite, not just the touched file — since `populator`/`delayed-importer` import from `core/neon-utils`/`core/utils`, and a change in an earlier task can break a later task's existing tests before that task even starts touching them.
- Do not touch `src/` (the Fastify app) or `render`/`main` branches — this plan only edits files under `web/` on `develop`.
- Do not touch `src/neon-to-methode.js`'s render-side logic or anything Méthode-related — out of scope, no `web/` equivalent exists.
- Follow this codebase's existing test convention exactly: Vitest (`describe`/`it`/`expect`/`vi`), mock external module boundaries via `vi.mock(...)` at the top of the test file (see existing mocks in each file for the pattern), reset mocks in `beforeEach`.

---

### Task 1: `hasWorkflow` guard in `lib/core/neon-utils.ts`

**Files:**
- Modify: `web/lib/core/neon-utils.ts`
- Modify: `web/lib/core/__tests__/neon-utils.test.ts`

**Interfaces:**
- Produces: `export async function hasWorkflow(familyRef?: string): Promise<boolean>` — later tasks (Task 3) import and call this.
- Consumes: `getNextSteps` (already imported in this file from `./neon-bo-api-v3`), whose result shape already has `.data.associatedWorkflow` and `.data.availableWorkflows` (already used by the existing `nextStepAssignmentBodyGenerator` in this same file — no new types needed).

- [ ] **Step 1: Add `hasWorkflow` to `neon-utils.ts`**

Render's JS (`src/helpers/neon-utils.js`):
```js
async function hasWorkflow(familyRef) {
    const getNextStepsResult = await neon.getNextSteps?.(familyRef);
    const associatedWorkflow = getNextStepsResult?.data?.associatedWorkflow;
    const availableWorkflows = getNextStepsResult?.data?.availableWorkflows;

    return !!associatedWorkflow?.processInstance?.processName || !!(availableWorkflows?.length > 0);
}
```

Add this as a new exported function in `web/lib/core/neon-utils.ts`, placed right before the existing `workflowTransitionTo` function (matches render's source order — `hasWorkflow` was added immediately after the module's imports, before `workflowTransitionTo`):

```ts
export async function hasWorkflow(familyRef?: string): Promise<boolean> {
  const getNextStepsResult = await getNextSteps(familyRef);
  const associatedWorkflow = getNextStepsResult?.data?.associatedWorkflow;
  const availableWorkflows = getNextStepsResult?.data?.availableWorkflows;

  return !!associatedWorkflow?.processInstance?.processName || !!(availableWorkflows && availableWorkflows.length > 0);
}
```

(`getNextSteps` is already imported at the top of this file — `import { getNextSteps, nextStepAssignment } from './neon-bo-api-v3';` — no import changes needed. The TS file calls `getNextSteps(familyRef)` directly, not `neon.getNextSteps?.(familyRef)`, matching how `workflowTransitionTo` in this same file already calls it a few lines below — stay consistent with that existing call style, not the JS file's `neon.`-prefixed optional-chaining style.)

- [ ] **Step 2: Add tests for `hasWorkflow` to `neon-utils.test.ts`**

Add a new `describe('hasWorkflow', ...)` block to `web/lib/core/__tests__/neon-utils.test.ts`, after the existing `describe('workflowTransitionTo', ...)` block and before `describe('nextStepAssignmentBodyGenerator', ...)`. Import `hasWorkflow` alongside the existing imports on line 2 (`import { workflowTransitionTo, nextStepAssignmentBodyGenerator, hasWorkflow } from '../neon-utils';`):

```ts
describe('hasWorkflow', () => {
  beforeEach(() => {
    mockGetNextSteps.mockReset();
  });

  it('returns true when the node has an associated workflow', async () => {
    mockGetNextSteps.mockResolvedValue({
      data: { associatedWorkflow: { processInstance: { processName: 'Story' } } },
    });

    expect(await hasWorkflow('fam-1')).toBe(true);
  });

  it('returns true when there are available workflows but none associated yet', async () => {
    mockGetNextSteps.mockResolvedValue({
      data: { associatedWorkflow: {}, availableWorkflows: [{ processInstance: { processName: 'Story' } }] },
    });

    expect(await hasWorkflow('fam-1')).toBe(true);
  });

  it('returns false when there is no associated workflow and no available workflows', async () => {
    mockGetNextSteps.mockResolvedValue({ data: { associatedWorkflow: {}, availableWorkflows: [] } });

    expect(await hasWorkflow('fam-1')).toBe(false);
  });

  it('returns false when getNextSteps resolves with no data', async () => {
    mockGetNextSteps.mockResolvedValue(undefined);

    expect(await hasWorkflow('fam-1')).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd web && npx vitest run lib/core/__tests__/neon-utils.test.ts`
Expected: all tests in this file pass (existing `workflowTransitionTo`/`nextStepAssignmentBodyGenerator` tests untouched and still green, plus the 4 new `hasWorkflow` tests).

- [ ] **Step 4: Commit**

```bash
cd web && cd .. && git add web/lib/core/neon-utils.ts web/lib/core/__tests__/neon-utils.test.ts
git commit -m "feat(web): port hasWorkflow guard from render's neon-utils.js"
```

---

### Task 2: Print metadata fields in `lib/core/utils.ts`

**Files:**
- Modify: `web/lib/core/utils.ts`
- Modify: `web/lib/core/__tests__/utils.test.ts` (confirmed exists — add to it, don't create a new file)

**Interfaces:**
- Produces: `MetadataGeneratorOptions` interface gains 4 new optional fields (`printSection`, `printPriority`, `printIssueDate`, `printDiffusion`) — Task 3's `populator/service.ts` already types `story.metadata?: MetadataGeneratorOptions`, so it picks these up automatically with no code change there, only this interface needs editing.

This task is independent of Task 1 — can be done in either order, but do it before Task 3 since Task 3's tests construct `StoryInput.metadata` objects that should be able to include print fields without a type error (though none of Task 3's existing tests currently populate print fields, so this isn't a hard blocker — sequencing 1→2→3→4 as listed is simplest).

- [ ] **Step 1: Extend `MetadataGeneratorOptions` and inject print fields into the generated XML**

Render's JS diff (`src/helpers/utils.js`, inside `metadataGenerator`):
```diff
     const seoTitle = meta?.seoTitle || '';
     const seoMeta = meta?.seoMeta || '';
     const keywords = meta?.keywords || '';
+    const printSection = meta?.printSection || '';
+    const printPriority = meta?.printPriority || '';
+    const printIssueDate = meta?.printIssueDate || '';
+    const printDiffusion = meta?.printDiffusion || '';
...
                 <Blog>
                     <BlogSection/>
                     <BlogDate/>
                 </Blog>
+                <Print>
+                    <PrintSection>${printSection}</PrintSection>
+                    <PrintPriority>${printPriority}</PrintPriority>
+                    <PrintIssueDate>${printIssueDate}</PrintIssueDate>
+                </Print>
                 <Output>
                     <Queue/>
                     <PriorityQueue/>
                     <Embargo/>
                 </Output>
             </DistributionChannels>
             <Diffusion>
-                <Diff_Print/>
+                <Diff_Print>${printDiffusion}</Diff_Print>
                 <Diff_Web/>
                 <Diff_Syndication/>
             </Diffusion>
```

In `web/lib/core/utils.ts`:

1. Extend the `MetadataGeneratorOptions` interface (currently `{ seoTitle?: string; seoMeta?: string; keywords?: string; }`):

```ts
export interface MetadataGeneratorOptions {
  seoTitle?: string;
  seoMeta?: string;
  keywords?: string;
  printSection?: string;
  printPriority?: string;
  printIssueDate?: string;
  printDiffusion?: string;
}
```

2. Inside `metadataGenerator`, right after the existing `const keywords = meta?.keywords || '';` line, add:

```ts
  const printSection = meta?.printSection || '';
  const printPriority = meta?.printPriority || '';
  const printIssueDate = meta?.printIssueDate || '';
  const printDiffusion = meta?.printDiffusion || '';
```

3. In the template literal body, find the existing `<Blog>...</Blog>` block immediately followed by `<Output>...</Output>` (both already inside `<DistributionChannels>`). Insert a new `<Print>` block between them:

```ts
                <Blog>
                    <BlogSection/>
                    <BlogDate/>
                </Blog>
                <Print>
                    <PrintSection>${printSection}</PrintSection>
                    <PrintPriority>${printPriority}</PrintPriority>
                    <PrintIssueDate>${printIssueDate}</PrintIssueDate>
                </Print>
                <Output>
```

4. Find the existing `<Diff_Print/>` self-closing tag inside `<Diffusion>` and change it to:

```ts
                <Diff_Print>${printDiffusion}</Diff_Print>
```

- [ ] **Step 2: Add/extend tests for the print fields**

Find the existing test(s) for `metadataGenerator` in `web/lib/core/__tests__/utils.test.ts` (search for `describe('metadataGenerator'` or similar — read the file first to match its exact existing assertion style, e.g. does it check for exact XML substrings via `.toContain()`, or parse the XML). Add a new test case alongside the existing ones:

```ts
it('includes print fields when provided', () => {
  const xml = metadataGenerator({
    printSection: '/Product/World',
    printPriority: '2',
    printIssueDate: '20260620',
    printDiffusion: 'PRINT',
  });
  expect(xml).toContain('<PrintSection>/Product/World</PrintSection>');
  expect(xml).toContain('<PrintPriority>2</PrintPriority>');
  expect(xml).toContain('<PrintIssueDate>20260620</PrintIssueDate>');
  expect(xml).toContain('<Diff_Print>PRINT</Diff_Print>');
});

it('renders empty print fields when not provided', () => {
  const xml = metadataGenerator(null);
  expect(xml).toContain('<PrintSection></PrintSection>');
  expect(xml).toContain('<Diff_Print></Diff_Print>');
});
```

Adjust the assertion style (`.toContain` vs. an XML-parsing helper) to match whatever convention the existing tests in this file already use — read them first.

- [ ] **Step 3: Run tests**

Run: `cd web && npx vitest run lib/core/__tests__/utils.test.ts`
Expected: all existing tests in this file still pass (the `<Diff_Print/>` self-closing-tag callers, if any test asserted that exact substring, will need that assertion updated to the new `<Diff_Print></Diff_Print>` or `<Diff_Print>VALUE</Diff_Print>` form — check for and fix any such pre-existing assertion as part of this step, it's a direct consequence of this task's change, not scope creep).

- [ ] **Step 4: Commit**

```bash
cd web && cd .. && git add web/lib/core/utils.ts web/lib/core/__tests__/utils.test.ts
git commit -m "feat(web): port print metadata fields (section/priority/issueDate/diffusion) to metadataGenerator"
```

---

### Task 3: `hasWorkflow` integration + per-story overrides in `lib/integrations/populator/service.ts`

**Files:**
- Modify: `web/lib/integrations/populator/service.ts`
- Modify: `web/lib/integrations/populator/__tests__/service.test.ts`

**Interfaces:**
- Consumes: `hasWorkflow` from Task 1 (`../../core/neon-utils`).
- Produces: `StoryInput` gains `name?: string` and `workfolder?: string` — Task 4's `dispatchStoryItem` (in `delayed-importer/service.ts`) sets both of these on the `StoryInput` object it builds, so Task 4 depends on this task's interface change existing first.

- [ ] **Step 1: Add `hasWorkflow` to the imports**

In `web/lib/integrations/populator/service.ts`, change:
```ts
import { workflowTransitionTo } from '../../core/neon-utils';
```
to:
```ts
import { workflowTransitionTo, hasWorkflow } from '../../core/neon-utils';
```

- [ ] **Step 2: Add `name` and `workfolder` to `StoryInput`**

The interface currently has `tgtWorkspace?: string;` but no `name`/`workfolder`. Add both (place them near `tgtWorkspace` for locality):

```ts
export interface StoryInput {
  id?: string;
  title?: string;
  language?: string;
  translation?: string;
  type?: string;
  name?: string;
  workfolder?: string;
  tgtWorkspace?: string;
  tgtSite?: string;
  tgtSection?: string;
  siteAsChannel?: boolean;
  mainContentHtml?: string;
  mainImageReference?: string;
  figureUrl?: string;
  figureCaption?: string;
  figureCredit?: string;
  overhead?: string;
  headline?: string;
  summary?: string;
  byline?: string;
  metadata?: MetadataGeneratorOptions;
  assignTo?: unknown;
  neon?: { workspace?: string };
}
```

- [ ] **Step 3: Honor `itemData.name` as a filename override in `getCreationOptions`**

Render's JS diff:
```diff
     const cleanedUpTitle = utils.removeNonAlphanumeric(itemData.id || itemData.title);
-    const fileName = cleanedUpTitle + '_' + (translation || language) + '.xml';
+    const generatedFileName = cleanedUpTitle + ((translation && '_' + translation) || (language && '_' + language) || '') + '.xml';
+    const fileName = itemData.name || generatedFileName;
```

Change the current TS:
```ts
  const cleanedUpTitle = removeNonAlphanumeric(itemData.id || itemData.title) || '';
  const fileName = `${cleanedUpTitle}_${translation || language}.xml`;
```
to:
```ts
  const cleanedUpTitle = removeNonAlphanumeric(itemData.id || itemData.title) || '';
  const generatedFileName = `${cleanedUpTitle}${(translation && `_${translation}`) || (language && `_${language}`) || ''}.xml`;
  const fileName = itemData.name || generatedFileName;
```

(This preserves both existing passing tests — `'my-story_en.xml'` when only `language: 'en'` is set, `'my-story_fr.xml'` when `translation: 'fr'` is also set — while fixing the previously-untested edge case of neither being set, and adding the new `name`-override behavior.)

- [ ] **Step 4: Add a test for the `name` override**

In `web/lib/integrations/populator/__tests__/service.test.ts`, add to the existing `describe('getCreationOptions', ...)` block:

```ts
it('uses itemData.name as an explicit filename override', () => {
  const options = getCreationOptions({ id: 'my-story', language: 'en', name: 'custom-name.xml' });
  expect(options.name).toBe('custom-name.xml');
});

it('omits the trailing underscore segment when neither translation nor language is set', () => {
  const options = getCreationOptions({ id: 'my-story' });
  expect(options.name).toBe('my-story.xml');
});
```

- [ ] **Step 5: Gate workflow transitions on `hasWorkflow` in `newNodeFromStory`**

Render's JS diff (already shown in full earlier in this plan's research — reproduced here as the exact target shape):
```js
if (updateStatus) {
    await neon.unlockNode(familyRef);

    if (await neonUtils.hasWorkflow(familyRef)) {
        await neonUtils.workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Edit', principals });

        if (publishStory) {
          await neonUtils.workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Ready', principals });
        } else {
          await neonUtils.workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Revision', principals });
        }
    } else {
        console.log(`Node ${familyRef} has no associated workflow, skipping workflow transitions`);
    }

    if (publishStory) {
      console.log(`${familyRef} updated successfully!`);
      const promotionResponse = await neon.promoteNode(familyRef, { targetSite: story.tgtSite, targetSection: story.tgtSection, mode: 'LIVE' });
      await neon.promoteNodeEverywhere(familyRef, { mode: 'LIVE' });
    }

    resolve(familyRef);
}
```

Change the current TS body (the block right after `if (!updateStatus) { ... return null; }`) from:
```ts
  await unlockNode(familyRef);
  await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Edit', principals });

  if (publishStory) {
    await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Ready', principals });
    console.log(`${familyRef} updated successfully!`);
    await promoteNode(familyRef, { targetSite: story.tgtSite, targetSection: story.tgtSection, mode: 'LIVE' });
    await promoteNodeEverywhere(familyRef, { mode: 'LIVE' });
  } else {
    await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Revision', principals });
  }

  return familyRef;
```
to:
```ts
  await unlockNode(familyRef);

  if (await hasWorkflow(familyRef)) {
    await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Edit', principals });

    if (publishStory) {
      await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Ready', principals });
    } else {
      await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Revision', principals });
    }
  } else {
    console.log(`Node ${familyRef} has no associated workflow, skipping workflow transitions`);
  }

  if (publishStory) {
    console.log(`${familyRef} updated successfully!`);
    await promoteNode(familyRef, { targetSite: story.tgtSite, targetSection: story.tgtSection, mode: 'LIVE' });
    await promoteNodeEverywhere(familyRef, { mode: 'LIVE' });
  }

  return familyRef;
```

- [ ] **Step 6: Update the test mocks and existing assertions for `hasWorkflow`**

**This is the step most likely to break existing tests if skipped.** `web/lib/integrations/populator/__tests__/service.test.ts` currently mocks `../../../core/neon-utils` with only `workflowTransitionTo: vi.fn()`. Since `hasWorkflow` is now also imported from that module, the existing `vi.mock('../../../core/neon-utils', ...)` factory must also provide it — otherwise it's `undefined` in the mocked module and calling it throws.

1. Change the mock factory:
```ts
vi.mock('../../../core/neon-utils', () => ({
  workflowTransitionTo: vi.fn(),
  hasWorkflow: vi.fn(),
}));
```
2. Import it alongside the existing import: change `import { workflowTransitionTo } from '../../../core/neon-utils';` to `import { workflowTransitionTo, hasWorkflow } from '../../../core/neon-utils';`.
3. Add it to the `mocks` object: `hasWorkflow: hasWorkflow as unknown as ReturnType<typeof vi.fn>,`.
4. In the `newNodeFromStory` describe block's `beforeEach`, after the existing `Object.values(mocks).forEach((m) => m.mockReset());` line, add `mocks.hasWorkflow.mockResolvedValue(true);` — **this is required** for the three existing tests ("publishes via Edit -> Ready...", "transitions to Revision...", and implicitly any other test relying on `workflowTransitionTo` having been called) to keep passing, since without it the mocked `hasWorkflow` defaults to returning `undefined` (falsy) after `mockReset()`, which would make the new `if (await hasWorkflow(familyRef))` branch skip every `workflowTransitionTo` call and silently break those pre-existing assertions.
5. Add one new test asserting the skip behavior:

```ts
it('skips workflow transitions and still promotes when the node has no associated workflow', async () => {
  mocks.hasWorkflow.mockResolvedValue(false);

  const familyRef = await newNodeFromStory({ id: 'story-1', tgtSite: 'theglobe' }, true);

  expect(familyRef).toBe('fam-1');
  expect(mocks.workflowTransitionTo).not.toHaveBeenCalled();
  expect(mocks.promoteNode).toHaveBeenCalled();
});
```

- [ ] **Step 7: Honor `story.workfolder` and `story.type` overrides in `populateNeonInstance`**

Render's JS diff:
```diff
         story.tgtSite = options.site;
-        story.tgtWorkspace = options.workspace;
+        story.tgtWorkspace = story.workfolder || options.workspace;
         story.tgtSection = options.section;
         story.language = options.language;
         story.translate = options.translate;
         story.siteAsChannel = options.siteAsChannel;
-        story.type = options.type || 'article';
+        story.type = story.type || options.type || 'article';
```

(Note: `story.translate = options.translate;` exists in render's JS but has no equivalent line in the current TS `populateNeonInstance` — the TS version doesn't set `story.translate` at all today. Don't add it: it's not part of `StoryInput`'s interface and isn't read anywhere in this file's TS port; adding an untyped/unused field would be scope creep beyond this port's actual behavioral changes.)

Change the current TS body inside the `for (const story of data)` loop from:
```ts
    story.tgtSite = options.site;
    story.tgtWorkspace = options.workspace;
    story.tgtSection = options.section;
    story.language = options.language;
    story.siteAsChannel = options.siteAsChannel;
    story.type = options.type || 'article';
```
to:
```ts
    story.tgtSite = options.site;
    story.tgtWorkspace = story.workfolder || options.workspace;
    story.tgtSection = options.section;
    story.language = options.language;
    story.siteAsChannel = options.siteAsChannel;
    story.type = story.type || options.type || 'article';
```

- [ ] **Step 8: Add a test for the per-story overrides in `populateNeonInstance`**

Add to the existing `describe('populateNeonInstance', ...)` block:

```ts
it('lets a per-story workfolder and type override the batch-level options', async () => {
  mocks.createNewStory.mockResolvedValueOnce({ familyRef: 'fam-1' });

  await populateNeonInstance(
    [{ id: 'story-1', workfolder: '/Custom/Folder', type: 'wirestory' }],
    { site: 'theglobe', workspace: '/Default/Folder', directPublish: false }
  );

  expect(mocks.createNewStory).toHaveBeenCalledWith(
    expect.objectContaining({ workFolder: '/Custom/Folder', type: 'wirestory' })
  );
});
```

(Confirmed: `CreateNewStoryOptions.workFolder` — capital F — at `web/lib/core/neon-bo-api-v3.ts:91`, and `getCreationOptions` already sets `workFolder: itemData.tgtWorkspace` — matches the assertion above as written.)

- [ ] **Step 9: Run tests**

Run: `cd web && npx vitest run lib/integrations/populator/__tests__/service.test.ts`
Expected: all tests pass, including the 3 new ones added in this task and all pre-existing ones (now passing because of the `mocks.hasWorkflow.mockResolvedValue(true)` default from Step 6).

- [ ] **Step 10: Commit**

```bash
cd web && cd .. && git add web/lib/integrations/populator/service.ts web/lib/integrations/populator/__tests__/service.test.ts
git commit -m "feat(web): port hasWorkflow skip-guard and per-story name/workfolder/type overrides to populator"
```

---

### Task 4: `type` → `contentType` rename in `lib/integrations/delayed-importer/service.ts`

**Files:**
- Modify: `web/lib/integrations/delayed-importer/service.ts`
- Modify: `web/lib/integrations/delayed-importer/__tests__/service.test.ts`
- Modify: `web/app/api/in/delayed-import/__tests__/route.test.ts` (one stale example payload, low-risk cleanup, see Step 6)

**Interfaces:**
- Consumes: `StoryInput.name`/`StoryInput.workfolder` from Task 3 (`../populator/service`) — `dispatchStoryItem` now sets both on the `StoryInput` object it builds.
- Changes a public contract: `JobItem.type` (the story/image discriminator) is renamed to `JobItem.contentType`; `JobItem.type` is repurposed to mean the Neon content type (e.g. `'article'`, `'wirestory'`), passed through to the populator. This is a breaking payload-shape change — same as it was on `render` (its `examples/delayed-import-*.json` fixtures and `test/delayed-importer.test.js` were both updated in the same commit). There are no example JSON fixtures under `web/` to update (confirmed — none exist yet).

- [ ] **Step 1: Rename the discriminator field, repurpose `type`**

Current:
```ts
export interface JobItem {
  type: ItemType;
  title?: string;
  content?: string;
  summary?: string;
  byline?: string;
  metadata?: MetadataGeneratorOptions & ImageMetadata;
  url?: string;
  name?: string;
  workfolder?: string;
  assignTo?: string | string[];
}
```
Change to:
```ts
export interface JobItem {
  contentType: ItemType;
  type?: string;
  title?: string;
  content?: string;
  summary?: string;
  byline?: string;
  metadata?: MetadataGeneratorOptions & ImageMetadata;
  url?: string;
  name?: string;
  workfolder?: string;
  assignTo?: string | string[];
}
```

- [ ] **Step 2: Update `validatePayload` to use `item.contentType`**

Every reference to `item.type` in `validatePayload` becomes `item.contentType`, including the error message text. Current:
```ts
    if (!item.type || !ITEM_TYPES.includes(item.type)) {
      return { valid: false, error: `items[${i}]: type must be one of ${ITEM_TYPES.join(', ')}` };
    }
    if (item.assignTo !== undefined && !isValidAssignTo(item.assignTo)) {
      return { valid: false, error: `items[${i}]: assignTo must be a string or an array of strings` };
    }
    if (item.type === 'story') {
      if (!item.title || typeof item.title !== 'string') {
        return { valid: false, error: `items[${i}]: story requires a title` };
      }
      if (!item.content || typeof item.content !== 'string') {
        return { valid: false, error: `items[${i}]: story requires content` };
      }
    }
    if (item.type === 'image') {
      if (!item.url || typeof item.url !== 'string') {
        return { valid: false, error: `items[${i}]: image requires a url` };
      }
    }
```
becomes:
```ts
    if (!item.contentType || !ITEM_TYPES.includes(item.contentType)) {
      return { valid: false, error: `items[${i}]: contentType must be one of ${ITEM_TYPES.join(', ')}` };
    }
    if (item.assignTo !== undefined && !isValidAssignTo(item.assignTo)) {
      return { valid: false, error: `items[${i}]: assignTo must be a string or an array of strings` };
    }
    if (item.contentType === 'story') {
      if (!item.title || typeof item.title !== 'string') {
        return { valid: false, error: `items[${i}]: story requires a title` };
      }
      if (!item.content || typeof item.content !== 'string') {
        return { valid: false, error: `items[${i}]: story requires content` };
      }
    }
    if (item.contentType === 'image') {
      if (!item.url || typeof item.url !== 'string') {
        return { valid: false, error: `items[${i}]: image requires a url` };
      }
    }
```

(Also check just above this block: `const item = payload.items[i] as Partial<JobItem> | null;` followed by `if (!item || typeof item !== 'object') { ... }` — no `.type` reference there, no change needed.)

- [ ] **Step 3: Update `runTick` to dispatch and record by `item.contentType`**

Current:
```ts
  const item = job.items[index];
  try {
    const dispatch = item.type === 'story' ? deps.dispatchStory : deps.dispatchImage;
    const outcome = await dispatch(item, job);
    job.results.push({
      index,
      type: item.type,
      status: 'ok',
      familyRef: outcome?.familyRef || null,
      at: new Date().toISOString(),
    });
    console.log(`delayed-import ${job.jobId}: item ${index} (${item.type}) imported`);
  } catch (error) {
    console.error(`❌ delayed-import ${job.jobId}: item ${index} (${item.type}) failed: ${(error as Error).message}`);
    job.results.push({
      index,
      type: item.type,
      status: 'error',
      error: (error as Error).message,
      at: new Date().toISOString(),
    });
  }
```
becomes:
```ts
  const item = job.items[index];
  try {
    const dispatch = item.contentType === 'story' ? deps.dispatchStory : deps.dispatchImage;
    const outcome = await dispatch(item, job);
    job.results.push({
      index,
      type: item.contentType,
      status: 'ok',
      familyRef: outcome?.familyRef || null,
      at: new Date().toISOString(),
    });
    console.log(`delayed-import ${job.jobId}: item ${index} (${item.contentType}) imported`);
  } catch (error) {
    console.error(`❌ delayed-import ${job.jobId}: item ${index} (${item.contentType}) failed: ${(error as Error).message}`);
    job.results.push({
      index,
      type: item.contentType,
      status: 'error',
      error: (error as Error).message,
      at: new Date().toISOString(),
    });
  }
```

(`JobResult.type: ItemType` keeps its existing type — only the source of the assigned value changes, from `item.type` to `item.contentType`.)

- [ ] **Step 4: Pass `item.type` (Neon content type) and `item.name` through in `dispatchStoryItem`**

Current:
```ts
/**
 * Story item -> storiesPopulator.newNodeFromStory.
 * Deliberately does NOT copy item.type onto the story: getCreationOptions
 * uses story.type as the Neon node type and must default to 'article'.
 * No figureUrl / language: image upload no-ops.
 */
export async function dispatchStoryItem(
  item: JobItem,
  job: Job,
  populator: Pick<typeof storiesPopulator, 'newNodeFromStory'> = storiesPopulator
): Promise<DispatchOutcome> {
  const story: storiesPopulator.StoryInput = {
    title: item.title,
    headline: item.title,
    summary: item.summary || '',
    byline: item.byline || '',
    mainContentHtml: item.content,
    metadata: item.metadata,
    tgtSite: job.site,
    tgtWorkspace: resolveWorkfolder(item, job),
    assignTo: resolveAssignTo(item, job),
  };
  const familyRef = await populator.newNodeFromStory(story, job.publish);
  return { familyRef: familyRef || null };
}
```
becomes:
```ts
/**
 * Story item -> storiesPopulator.newNodeFromStory.
 * item.type is the Neon content type (e.g. 'article', 'wirestory'); getCreationOptions
 * uses story.type as the Neon node type and defaults to 'article' when unset.
 * No figureUrl / language / translate: image upload no-ops, translation skipped.
 */
export async function dispatchStoryItem(
  item: JobItem,
  job: Job,
  populator: Pick<typeof storiesPopulator, 'newNodeFromStory'> = storiesPopulator
): Promise<DispatchOutcome> {
  const story: storiesPopulator.StoryInput = {
    type: item.type,
    name: item.name,
    title: item.title,
    headline: item.title,
    summary: item.summary || '',
    byline: item.byline || '',
    mainContentHtml: item.content,
    metadata: item.metadata,
    tgtSite: job.site,
    tgtWorkspace: resolveWorkfolder(item, job),
    assignTo: resolveAssignTo(item, job),
  };
  const familyRef = await populator.newNodeFromStory(story, job.publish);
  return { familyRef: familyRef || null };
}
```

`dispatchImageItem` is unchanged — render's diff didn't touch it, and it doesn't reference `.type` at all today.

- [ ] **Step 5: Update `service.test.ts` — rename every item literal's `type` to `contentType`, add the new `item.type` passthrough test**

In `web/lib/integrations/delayed-importer/__tests__/service.test.ts`, every object literal of the shape `{ type: 'story', ... }` or `{ type: 'image', ... }` representing a `JobItem` becomes `{ contentType: 'story', ... }` / `{ contentType: 'image', ... }`. This affects (by line, in the file as currently read):
- `basePayload()`'s default `items` array (3 occurrences).
- The `'accepts a valid mixed payload'` test's `items`.
- The `'rejects invalid item type with index in the message'` test's `items` (note: keep this test's deliberately-invalid item using an unrecognized value — `{ contentType: 'video' as unknown as 'story', url: '...' }` — same idea as render's `{ type: 'video', ... }`, just the field renamed).
- The `'accepts assignTo as string or array...'` test's nested item.
- The `'rejects invalid assignTo'` test's nested item.
- The `'enforces per-type required fields'` test's three item literals.
- The `'routes image items to dispatchImage'` test's two item literals.
- The `dispatchStoryItem` describe block: all 4 `item`/literal constructions (`'maps item fields...'`, `'lets item.workfolder override...'`, `'passes job-level assignTo...'`, `'lets item.assignTo override...'`).
- The `dispatchImageItem` describe block: both item literals.

Also update the comment on the `'maps item fields to the populator story shape'` test (currently `// must NOT leak item.type: getCreationOptions would use it as the Neon node type`) to match render's updated comment: `// no item.type set: getCreationOptions defaults story.type to 'article'`. The assertion itself (`expect(story.type).toBeUndefined();`) doesn't change — that test's `item` has no `type` field set, so `story.type` is still `undefined`, just for a different reason now (explicit passthrough of an absent field, not a deliberate omission).

Add one new test, mirroring render's, to the `dispatchStoryItem` describe block:

```ts
it('passes item.type through to the populator as the Neon content type', async () => {
  let received: Record<string, unknown> | undefined;
  const fakePopulator = {
    newNodeFromStory: async (story: unknown) => {
      received = story as Record<string, unknown>;
      return 'x';
    },
  };
  const job = { site: 's', workspace: 'ws', workfolder: null, publish: false } as Parameters<typeof dispatchStoryItem>[1];

  await dispatchStoryItem({ contentType: 'story', type: 'wirestory', title: 'T', content: 'c' }, job, fakePopulator);
  expect(received?.type).toBe('wirestory');
});
```

- [ ] **Step 6: Cosmetic cleanup in the route test's stale example payload**

In `web/app/api/in/delayed-import/__tests__/route.test.ts`, the `'returns 202 with the job submission on a valid payload'` test builds a `payload` object with `items: [{ type: 'story', title: 'A', content: '<p>a</p>' }]`. This payload is never type-checked against `JobItem` (it's passed through a `jsonRequest(url, body: unknown)` helper, and `createJob`/`validatePayload` are fully mocked in this file), so leaving it as-is would not cause a compile or test failure — but it's now an inaccurate example of the real payload shape. Change it to `items: [{ contentType: 'story', title: 'A', content: '<p>a</p>' }]` for accuracy.

- [ ] **Step 7: Run tests**

Run: `cd web && npx vitest run lib/integrations/delayed-importer/__tests__/service.test.ts app/api/in/delayed-import/__tests__/route.test.ts`
Expected: all tests pass.

Then run the full suite to confirm nothing elsewhere broke:
Run: `cd web && npx vitest run`
Expected: all tests pass (test count should be the original count from the Phase 1/2/3 docs plus the new tests added across this plan's 4 tasks — don't worry about matching an exact number, just confirm zero failures).

- [ ] **Step 8: Commit**

```bash
cd web && cd .. && git add web/lib/integrations/delayed-importer/service.ts web/lib/integrations/delayed-importer/__tests__/service.test.ts web/app/api/in/delayed-import/__tests__/route.test.ts
git commit -m "feat(web): rename JobItem.type to contentType, pass item.type through as the Neon content type"
```

---

## Verification (after all tasks)

1. `cd web && npx vitest run` — full suite green, no failures, no skipped tests left unexplained.
2. `cd web && npx tsc --noEmit` (or `npm run type-check` if that script exists in `web/package.json` — check first) — confirms the `JobItem.contentType` rename and all the new optional fields don't leave any type error anywhere in `web/`.
3. Spot-check by hand that render's two source commits (`555471c`, `fdaff75`'s `utils.js` hunk) are now both fully represented: `git -C /Users/aureliano.ventrella/Repos/neon-integrations-example show 555471c -- src/helpers/neon-utils.js src/stories-populator.js src/delayed-importer.js` and `git -C /Users/aureliano.ventrella/Repos/neon-integrations-example show fdaff75 -- src/helpers/utils.js`, re-read each hunk, confirm every behavioral change has a corresponding TS edit in this plan's 4 tasks.
4. No test runner gap here — this is the one porting task in this session where the target codebase already has full Vitest coverage, so there's no "no test framework" caveat like the Fastify-side work earlier this session.
