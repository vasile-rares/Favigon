/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           INTEGRATION GUIDE — Canvas Engine Migration           ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║ This file shows how canvas-page.component.ts would use the new ║
 * ║ engine + editor layer. It is NOT a drop-in replacement — it's  ║
 * ║ a pattern reference for migrating the current 2800+ line       ║
 * ║ component incrementally.                                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * MIGRATION STRATEGY (recommended):
 * 1. Add the new services to the component's `providers` array.
 * 2. Create a SceneGraph from the existing CanvasElement[] on load.
 * 3. Run both old and new systems in parallel while migrating.
 * 4. Replace gesture handlers one at a time (drag → resize → rotate).
 * 5. Replace the flat elements() signal with the SceneGraph.
 * 6. Remove the old services and utilities.
 */

import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  HostListener,
} from '@angular/core';

// ── Engine (framework-agnostic) ─────────────────────────────
import { SceneGraph, Camera2D, HitTester, RenderCache, mat3ToCssMatrix } from './engine';
import type { SceneNode, SceneNodeDTO, PageModel } from './engine';
import { createSceneNode } from './engine/scene/scene-graph';

// ── Editor Layer (Angular services) ─────────────────────────
import { EditorStateService, GestureStartState } from './editor/state/editor-state.service';
import { HistoryService, HistorySnapshot } from './editor/history/history.service';
import { SnapService } from './editor/snap/snap.service';
import { SyncService } from './editor/sync/sync.service';
import { TransformHandler } from './editor/transforms/transform-handler';

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │ EXAMPLE: Component Setup                                    │
 * │ Shows how to wire up the engine + editor services.          │
 * └─────────────────────────────────────────────────────────────┘
 */

// @Component({
//   selector: 'app-canvas-page',
//   providers: [
//     EditorStateService,
//     HistoryService,
//     SnapService,
//     SyncService,
//     TransformHandler,
//   ],
//   // ... template, styles
// })
// export class CanvasPageComponent implements OnInit {

//   // ── Inject Services ─────────────────────────────────────
//   private readonly editorState = inject(EditorStateService);
//   private readonly history = inject(HistoryService);
//   private readonly snap = inject(SnapService);
//   private readonly sync = inject(SyncService);
//   private readonly transforms = inject(TransformHandler);

//   // ── Engine Instances (per-page) ─────────────────────────
//   private graph = new SceneGraph();
//   private camera = new Camera2D();
//   private hitTester = new HitTester();
//   private renderCache = new RenderCache();

//   // ── Angular Signals ─────────────────────────────────────
//   readonly pages = signal<PageModel[]>([]);
//   readonly graphVersion = signal(0);
// }

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │ EXAMPLE 1: Loading a project (deserialize → SceneGraph)     │
 * └─────────────────────────────────────────────────────────────┘
 *
 * OLD: pages signal held flat CanvasElement[] arrays.
 * NEW: each page's elements are deserialized into a SceneGraph.
 */
function exampleLoadProject(pages: PageModel[], currentPageId: string): SceneGraph {
  const page = pages.find((p) => p.id === currentPageId);
  if (!page) return new SceneGraph();

  // Deserialize flat DTO[] → tree
  const graph = SceneGraph.deserialize(page.nodes);

  // Matrices are computed lazily. Force computation for initial render.
  for (const root of graph.getRootNodes()) {
    graph.traverseDFS(root, (node: SceneNode) => graph.ensureWorldMatrix(node));
  }

  return graph;
}

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │ EXAMPLE 2: Zoom & Pan with Camera                           │
 * └─────────────────────────────────────────────────────────────┘
 *
 * OLD: viewport service used DOM queries and separate zoom/offset signals.
 * NEW: Camera2D handles all viewport math. No DOM queries.
 */
function exampleZoomPan(camera: Camera2D, containerWidth: number, containerHeight: number): void {
  // Zoom to cursor position (ctrl+wheel)
  camera.handleWheel(
    /* deltaX */ 0,
    /* deltaY */ -120,
    /* ctrlKey */ true,
    /* screenPoint */ { x: containerWidth / 2, y: containerHeight / 2 },
  );

  // Pan (scroll without ctrl)
  camera.handleWheel(
    /* deltaX */ -30,
    /* deltaY */ 50,
    /* ctrlKey */ false,
    /* screenPoint */ { x: 0, y: 0 },
  );

  // Focus on a rect (e.g., when clicking a layer)
  camera.focusOnRect(
    { x: 100, y: 200, width: 1440, height: 900 },
    containerWidth,
    containerHeight,
    { top: 0, right: 300, bottom: 0, left: 240 }, // safe-area insets
  );

  // Apply to DOM: the canvas scene wrapper gets this CSS transform
  const sceneTransform = camera.getSceneTransformCss();
  // → "translate(...)px scale(...)"
  console.log('Scene CSS transform:', sceneTransform);

  // Convert screen point → world point (for pointer events)
  const worldPoint = camera.screenToWorld({ x: 500, y: 300 });
  console.log('World point:', worldPoint);
}

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │ EXAMPLE 3: Hit Testing (selection on click)                 │
 * └─────────────────────────────────────────────────────────────┘
 *
 * OLD: getAbsoluteBounds() + flat rect check. Broke for rotated elements.
 * NEW: inverse-transform world point into each node's local space.
 *      Works correctly for nested + rotated elements.
 */
function exampleHitTest(
  hitTester: HitTester,
  graph: SceneGraph,
  camera: Camera2D,
  screenX: number,
  screenY: number,
): SceneNode | null {
  // Convert screen → world
  const worldPoint = camera.screenToWorld({ x: screenX, y: screenY });

  // Hit test: returns topmost visible node under the pointer
  const result = hitTester.hitTest(graph, worldPoint, (node: SceneNode) => {
    // Skip invisible nodes
    if (!node.visible) return false;
    // Skip frame root nodes (only hit their children)
    // Uncomment if frames shouldn't be directly selectable:
    // if (isFrame(node) && !node.parent) return false;
    return true;
  });

  if (result) {
    console.log(
      `Hit: ${result.node.name} at local (${result.localPoint.x}, ${result.localPoint.y})`,
    );
    return result.node;
  }

  return null;
}

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │ EXAMPLE 4: Drag Gesture (with snap + sync)                  │
 * └─────────────────────────────────────────────────────────────┘
 *
 * OLD: every pointermove mutated the full pages signal → full CD.
 * NEW: pointermove only updates liveTransform (a lightweight signal).
 *      Scene graph is mutated ONCE on pointer-up.
 */
function exampleDragGesture(
  editorState: EditorStateService,
  snap: SnapService,
  sync: SyncService,
  graph: SceneGraph,
  camera: Camera2D,
  renderCache: RenderCache,
  history: HistoryService,
  nodeId: string,
  createSnapshot: () => HistorySnapshot,
): void {
  const node = graph.getNode(nodeId);
  if (!node) return;

  // ── On Pointer Down ─────────────────────────────────────
  const worldPointer = camera.screenToWorld({ x: 400, y: 300 }); // from event

  const startState: GestureStartState = {
    nodeId,
    type: 'drag',
    startPointer: worldPointer,
    startPosition: { ...node.position },
    startWidth: node.width,
    startHeight: node.height,
    startRotation: node.rotation,
    startCenter: {
      x: node.position.x + node.width / 2,
      y: node.position.y + node.height / 2,
    },
    dragOffset: {
      x: worldPointer.x - node.position.x,
      y: worldPointer.y - node.position.y,
    },
    aspectRatio: node.width / Math.max(node.height, 1),
    handle: 'nw', // not used for drag
  };

  // Begin history tracking
  history.beginGestureHistory(createSnapshot);

  // Cache snap candidates (ONCE — not per frame)
  renderCache.update(graph);
  snap.cacheSnapCandidates(graph, renderCache, nodeId, node.parent?.id ?? null);

  // Begin the gesture
  editorState.beginGesture('drag', startState);

  // ── On Pointer Move (called per frame) ──────────────────
  function onPointerMove(screenX: number, screenY: number): void {
    const worldPt = camera.screenToWorld({ x: screenX, y: screenY });
    const start = editorState.gestureStart!;

    // Raw position = pointer - offset
    let newX = worldPt.x - start.dragOffset.x;
    let newY = worldPt.y - start.dragOffset.y;

    // Snap
    const snapped = snap.computeSnap(newX, newY, start.startWidth, start.startHeight);
    newX = snapped.x;
    newY = snapped.y;

    // Update live transform (does NOT mutate the scene graph)
    editorState.updateLiveTransform({
      deltaPosition: {
        x: newX - start.startPosition.x,
        y: newY - start.startPosition.y,
      },
    });
  }

  // ── On Pointer Up ───────────────────────────────────────
  function onPointerUp(): void {
    const finalTransform = editorState.endGesture();
    snap.clear();

    if (finalTransform) {
      // Commit to scene graph (one mutation)
      const dx = finalTransform.deltaPosition.x;
      const dy = finalTransform.deltaPosition.y;
      const start = startState;

      graph.setLocalTransform(nodeId, {
        position: {
          x: start.startPosition.x + dx,
          y: start.startPosition.y + dy,
        },
      });

      // Sync to other device frames
      const movedNode = graph.getNode(nodeId);
      if (movedNode) {
        const syncPatches = sync.syncElementMoveToPrimary(graph, movedNode);
        for (const patch of syncPatches) {
          graph.setLocalTransform(patch.nodeId, { position: patch.position });
          graph.setSize(patch.nodeId, patch.width, patch.height);
        }
      }
    }

    // Commit history
    history.commitGestureHistory(createSnapshot);
  }
}

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │ EXAMPLE 5: Resize with Aspect-Ratio Lock                   │
 * └─────────────────────────────────────────────────────────────┘
 */
function exampleResize(
  transforms: TransformHandler,
  editorState: EditorStateService,
  graph: SceneGraph,
  camera: Camera2D,
  screenX: number,
  screenY: number,
  shiftKey: boolean,
  altKey: boolean,
): void {
  if (!editorState.gestureStart) return;

  const worldPointer = camera.screenToWorld({ x: screenX, y: screenY });
  const result = transforms.computeResize(
    editorState.gestureStart,
    worldPointer,
    graph,
    shiftKey,
    altKey,
  );

  // On pointer-up: commit result.x, result.y, result.width, result.height
  // to the scene graph via graph.setLocalTransform + graph.setSize.
}

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │ EXAMPLE 6: Rotation                                         │
 * └─────────────────────────────────────────────────────────────┘
 *
 * OLD: rotation was set as degrees in a CSS `rotate()` transform,
 *      but the AABB hit test never accounted for it.
 * NEW: rotation is in radians, stored on SceneNode.rotation,
 *      propagated through the world matrix. Hit testing, rendering,
 *      and resize all go through the matrix pipeline.
 */
function exampleRotation(
  transforms: TransformHandler,
  editorState: EditorStateService,
  camera: Camera2D,
  screenX: number,
  screenY: number,
): void {
  if (!editorState.gestureStart) return;

  const worldPointer = camera.screenToWorld({ x: screenX, y: screenY });
  const result = transforms.computeRotation(editorState.gestureStart, worldPointer);

  // During drag: update live transform
  editorState.updateLiveTransform({
    deltaRotation: result.rotation - editorState.gestureStart.startRotation,
  });

  // On pointer-up: commit to scene graph
  // graph.setLocalTransform(nodeId, { rotation: result.rotation });
}

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │ EXAMPLE 7: Nested Elements (parent-child transforms)        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * OLD: child position = { x: absX - parentAbsX, y: absY - parentAbsY }
 *      This broke when the parent was rotated.
 * NEW: child position is in PARENT-local space. The world matrix
 *      chain (parent.worldMatrix * child.localMatrix) handles
 *      everything including rotation.
 */
function exampleNestedElements(graph: SceneGraph): void {
  // Create a rotated frame
  const frameNode = createSceneNode(
    crypto.randomUUID(),
    'Desktop',
    {
      type: 'frame',
      fill: '#ffffff',
      strokeWidth: 0,
      strokeStyle: 'solid',
      cornerRadius: 0,
      clipContent: true,
    },
    {
      position: { x: 100, y: 50 },
      rotation: Math.PI / 12, // 15 degrees
      width: 1440,
      height: 900,
    },
  );
  graph.addNode(frameNode);

  // Add a child rectangle — position is local to the frame
  const rectNode = createSceneNode(
    crypto.randomUUID(),
    'Button',
    {
      type: 'rectangle',
      fill: '#3b82f6',
      strokeWidth: 0,
      strokeStyle: 'solid',
      cornerRadius: 8,
    },
    {
      position: { x: 50, y: 50 }, // 50px from parent origin
      width: 200,
      height: 60,
    },
  );
  graph.addNode(rectNode, frameNode.id);

  // World matrix of the rectangle includes the frame's rotation.
  // No manual position offset math needed.
  const worldBounds = graph.getWorldBounds(rectNode);
  console.log('Button world bounds:', worldBounds);

  // Rendering in the template: use the CSS matrix from the world matrix
  if (rectNode) {
    const css = mat3ToCssMatrix(rectNode.worldMatrix);
    console.log('Button CSS transform:', css);
    // → "matrix(a, b, c, d, tx, ty)" including parent rotation
  }
}

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │ EXAMPLE 8: Undo / Redo                                      │
 * └─────────────────────────────────────────────────────────────┘
 *
 * OLD: 10-step stack, JSON.stringify equality check.
 * NEW: 50-step stack, version-counter equality (O(1)).
 */
function exampleUndoRedo(
  history: HistoryService,
  graph: SceneGraph,
  editorState: EditorStateService,
  pages: PageModel[],
): void {
  const createSnapshot = (): HistorySnapshot => ({
    pages,
    currentPageId: editorState.currentPageId(),
    selectedNodeId: editorState.selectedNodeId(),
    version: graph.version,
  });

  const applySnapshot = (snap: HistorySnapshot): void => {
    // Restore the scene graph from the snapshot's serialized pages
    const page = snap.pages.find((p: PageModel) => p.id === snap.currentPageId);
    if (page) {
      const restored = SceneGraph.deserialize(page.nodes);
      // Replace the current graph (or swap reference)
      // graph = restored; // component would hold this in a signal
    }
    editorState.selectedNodeId.set(snap.selectedNodeId);
    editorState.currentPageId.set(snap.currentPageId);
  };

  // Undo
  history.undo(createSnapshot, applySnapshot);

  // Redo
  history.redo(createSnapshot, applySnapshot);
}

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │ EXAMPLE 9: Template Rendering Pattern                       │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Shows the recommended template pattern for rendering nodes.
 *
 * OLD:
 *   @for (element of elements(); track element.id) {
 *     <div [style.left.px]="getAbsoluteBounds(element).x"
 *          [style.top.px]="getAbsoluteBounds(element).y" ...>
 *   }
 *   → getAbsoluteBounds called 4N times per CD cycle.
 *
 * NEW:
 *   The RenderCache precomputes world bounds once per CD cycle
 *   (version-gated), and the template reads from a Map.
 *   The liveTransform overlay avoids mutating the scene graph
 *   during drag, reducing CD from O(n) to O(1).
 */

// <!-- In the template: -->
// <div class="canvas-scene" [style.transform]="camera.getSceneTransformCss()">
//
//   @for (node of visibleNodes(); track node.id) {
//     <div class="element"
//          [style.transform]="getNodeTransformCss(node)"
//          [style.width.px]="getNodeWidth(node)"
//          [style.height.px]="getNodeHeight(node)"
//          [style.opacity]="node.opacity">
//
//       <!-- Type-specific rendering -->
//       @switch (node.data.type) {
//         @case ('rectangle') { ... }
//         @case ('text') { ... }
//         @case ('image') { ... }
//       }
//     </div>
//   }
//
//   <!-- Snap lines (rendered separately, not per-element) -->
//   @for (line of snap.activeLines(); track $index) {
//     <div class="snap-line" [class.vertical]="line.type === 'vertical'" ...></div>
//   }
// </div>

/**
 * Example computed signal for visible nodes ordered for rendering.
 */
function exampleVisibleNodes(graph: SceneGraph): SceneNode[] {
  const nodes: SceneNode[] = [];
  for (const root of graph.getRootNodes()) {
    graph.traverseDFS(root, (node: SceneNode) => {
      if (graph.isEffectivelyVisible(node.id)) {
        nodes.push(node);
      }
    });
  }
  return nodes;
}

/**
 * Example: get the CSS transform for a node, incorporating the
 * live transform overlay if this node is being dragged.
 *
 * This replaces the old pattern of reading getAbsoluteBounds()
 * + computing left/top offset manually.
 */
// getNodeTransformCss(node: SceneNode): string {
//   const liveXform = this.editorState.liveTransform();
//
//   if (liveXform && liveXform.nodeId === node.id) {
//     // During drag: offset the node's rendered position
//     const m = mat3Clone(node.worldMatrix);
//     // Apply delta as a translation on top
//     m[6] += liveXform.deltaPosition.x;
//     m[7] += liveXform.deltaPosition.y;
//     return mat3ToCssMatrix(m);
//   }
//
//   return mat3ToCssMatrix(node.worldMatrix);
// }

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │ INCREMENTAL MIGRATION CHECKLIST                             │
 * ├─────────────────────────────────────────────────────────────┤
 * │                                                             │
 * │ Phase 1: Add engine alongside existing system               │
 * │ ☐ Add services to component providers array                 │
 * │ ☐ On project load: build SceneGraph from CanvasElement[]    │
 * │ ☐ Keep pages signal for backward compatibility              │
 * │                                                             │
 * │ Phase 2: Replace gesture handlers                           │
 * │ ☐ Drag: use EditorState.liveTransform instead of direct     │
 * │   signal mutation                                           │
 * │ ☐ Resize: use TransformHandler.computeResize                │
 * │ ☐ Rotate: use TransformHandler.computeRotation              │
 * │ ☐ Corner radius: use TransformHandler.computeCornerRadius   │
 * │                                                             │
 * │ Phase 3: Replace viewport                                   │
 * │ ☐ Replace CanvasViewportService with Camera2D                │
 * │ ☐ Remove DOM queries (querySelector('.canvas-container'))   │
 * │ ☐ Use camera.getSceneTransformCss() for the scene wrapper   │
 * │ ☐ Use camera.screenToWorld() for pointer conversion         │
 * │                                                             │
 * │ Phase 4: Replace hit testing                                │
 * │ ☐ Replace the AABB click test with HitTester                │
 * │ ☐ Verify rotated element selection works                    │
 * │                                                             │
 * │ Phase 5: Replace rendering                                  │
 * │ ☐ Replace getAbsoluteBounds() calls with RenderCache        │
 * │ ☐ Use mat3ToCssMatrix(node.worldMatrix) for transforms      │
 * │ ☐ Remove the 4N-per-CD getAbsoluteBounds pattern            │
 * │                                                             │
 * │ Phase 6: Replace history                                    │
 * │ ☐ Use HistoryService v2 with version counter                │
 * │ ☐ Set MAX_HISTORY_STEPS to 50                               │
 * │ ☐ Remove JSON.stringify equality check                      │
 * │                                                             │
 * │ Phase 7: Replace sync system                                │
 * │ ☐ Use SyncService methods instead of component privates     │
 * │ ☐ Fix getPrimaryFrame to not compare display titles          │
 * │                                                             │
 * │ Phase 8: Clean up                                           │
 * │ ☐ Remove old CanvasElement interface                         │
 * │ ☐ Remove old canvas-element.service.ts                       │
 * │ ☐ Remove old canvas-viewport.service.ts                      │
 * │ ☐ Remove old canvas-history.service.ts                       │
 * │ ☐ Remove old canvas-snap.util.ts                             │
 * │ ☐ Remove flat elements() signal                              │
 * │                                                             │
 * └─────────────────────────────────────────────────────────────┘
 */
