// @flow
import * as React from "react";
import isEqual from "lodash.isequal";
import clsx from "clsx";
import {
  bottom,
  childrenEqual,
  cloneLayoutItem,
  compact,
  compactType,
  fastRGLPropsEqual,
  getAllCollisions,
  getLayoutItem,
  moveElement,
  noop,
  synchronizeLayoutWithChildren,
  withLayoutItem,
  overlaps,
} from "./utils";

import { calcXY } from "./calculateUtils";

import GridItem from "./GridItem";
import ReactGridLayoutPropTypes from "./ReactGridLayoutPropTypes";

const layoutClassName = "react-grid-layout";
let isFirefox = false;
// Try...catch will protect from navigator not existing (e.g. node) or a bad implementation of navigator
try {
  isFirefox = /firefox/i.test(navigator.userAgent);
} catch (e) {
  /* Ignore */
}

/**
 * A reactive, fluid grid layout with draggable, resizable components.
 */

export default class ReactGridLayout extends React.Component {
  // TODO publish internal ReactClass displayName transform
  static displayName = "ReactGridLayout";

  // Refactored to another module to make way for preval
  static propTypes = ReactGridLayoutPropTypes;

  static defaultProps = {
    autoSize: true,
    cols: 12,
    className: "",
    style: {},
    draggableHandle: "",
    draggableCancel: "",
    containerPadding: null,
    rowHeight: 150,
    maxRows: Infinity, // infinite vertical growth
    layout: [],
    margin: [10, 10],
    isBounded: false,
    isDraggable: true,
    isResizable: true,
    allowOverlap: false,
    isDroppable: false,
    useCSSTransforms: true,
    transformScale: 1,
    verticalCompact: true,
    compactType: "vertical",
    preventCollision: false,
    droppingItem: {
      i: "__dropping-elem__",
      h: 1,
      w: 1,
    },
    resizeHandles: ["se"],
    onLayoutChange: noop,
    onDragStart: noop,
    onDrag: noop,
    onDragStop: noop,
    onResizeStart: noop,
    onResize: noop,
    onResizeStop: noop,
    onDrop: noop,
    onDropDragOver: noop,
    tooltip: null,
  };

  state = {
    activeDrag: null,
    layout: synchronizeLayoutWithChildren(
      this.props.layout,
      this.props.children,
      this.props.cols,
      // Legacy support for verticalCompact: false
      compactType(this.props),
      this.props.allowOverlap
    ),
    mounted: false,
    oldDragItem: null,
    oldLayout: null,
    oldResizeItem: null,
    droppingDOMNode: null,
    children: [],
    draggingId: null,
    resizingId: null,
  };

  dragEnterCounter = 0;
  oldResizePlaceholder = null;
  oldLayout = null;
  oldSwapId = null;

  componentDidMount() {
    this.setState({ mounted: true });
    // Possibly call back with layout on mount. This should be done after correcting the layout width
    // to ensure we don't rerender with the wrong width.
    this.onLayoutMaybeChanged(this.state.layout, this.props.layout);
  }

  static getDerivedStateFromProps(nextProps, prevState) {
    let newLayoutBase;

    if (prevState.activeDrag) {
      return null;
    }

    // Legacy support for compactType
    // Allow parent to set layout directly.
    if (!isEqual(nextProps.layout, prevState.propsLayout) || nextProps.compactType !== prevState.compactType) {
      newLayoutBase = nextProps.layout;
    } else if (!childrenEqual(nextProps.children, prevState.children)) {
      // If children change, also regenerate the layout. Use our state
      // as the base in case because it may be more up to date than
      // what is in props.
      newLayoutBase = prevState.layout;
    }

    // We need to regenerate the layout.
    if (newLayoutBase) {
      const newLayout = synchronizeLayoutWithChildren(
        newLayoutBase,
        nextProps.children,
        nextProps.cols,
        compactType(nextProps),
        nextProps.allowOverlap
      );

      return {
        layout: newLayout,
        // We need to save these props to state for using
        // getDerivedStateFromProps instead of componentDidMount (in which we would get extra rerender)
        compactType: nextProps.compactType,
        children: nextProps.children,
        propsLayout: nextProps.layout,
      };
    }

    return null;
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      // NOTE: this is almost always unequal. Therefore the only way to get better performance
      // from SCU is if the user intentionally memoizes children. If they do, and they can
      // handle changes properly, performance will increase.
      this.props.children !== nextProps.children ||
      !fastRGLPropsEqual(this.props, nextProps, isEqual) ||
      this.state.activeDrag !== nextState.activeDrag ||
      this.state.mounted !== nextState.mounted ||
      this.state.droppingPosition !== nextState.droppingPosition
    );
  }

  componentDidUpdate(prevProps, prevState) {
    if (!this.state.activeDrag) {
      const newLayout = this.state.layout;
      const oldLayout = prevState.layout;

      this.onLayoutMaybeChanged(newLayout, oldLayout);
    }
  }

  /**
   * Calculates a pixel value for the container.
   * @return {String} Container height in pixels.
   */
  containerHeight() {
    if (!this.props.autoSize) return;
    const nbRow = bottom(this.state.layout);
    const containerPaddingY = this.props.containerPadding ? this.props.containerPadding[1] : this.props.margin[1];
    return nbRow * this.props.rowHeight + (nbRow - 1) * this.props.margin[1] + containerPaddingY * 2 + "px";
  }

  canMove = (layout) => {
    const maxRows = this.props.maxRows;

    if (!maxRows) return true;

    return layout.every(({ x, y, w, h }) => y + h <= maxRows && x + w <= this.props.cols);
  };

  /**
   * When dragging starts
   * @param {String} i Id of the child
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDragStart = (i, x, y, { e, node }) => {
    const { layout } = this.state;
    const l = getLayoutItem(layout, i);
    if (!l) return;

    this.setState({
      oldDragItem: cloneLayoutItem(l),
      oldLayout: layout,
      draggingId: i,
    });

    return this.props.onDragStart(layout, l, l, null, e, node);
  };

  /**
   * Each drag movement create a new dragelement and move the element to the dragged location
   * @param {String} i Id of the child
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDrag = (i, x, y, { e, node }) => {
    const { oldDragItem } = this.state;
    let { layout } = this.state;
    const { cols, allowOverlap, preventCollision } = this.props;
    const l = getLayoutItem(layout, i);

    if (!l) return;

    let newLayout = layout.map((i) => ({ ...i }));

    this.oldLayout = this.canMove(newLayout) ? newLayout : this.oldLayout;

    // Create placeholder (display only)
    const placeholder = {
      w: l.w,
      h: l.h,
      x: l.x,
      y: l.y,
      placeholder: true,
      i: i,
    };

    // Move the element to the dragged location.
    const isUserAction = false;

    const firstCollidedIndex = layout.findIndex((l1) => overlaps(l1, { ...l, x, y }));

    if (firstCollidedIndex !== -1 && layout[firstCollidedIndex].i !== this.oldSwapId) {
      const thisIndex = layout.findIndex((i1) => i1.i === i);
      if (
        layout[firstCollidedIndex].y === layout[thisIndex].y &&
        layout[firstCollidedIndex].h === layout[thisIndex].h
      ) {
        if (layout[thisIndex].x + layout[thisIndex].w === layout[firstCollidedIndex].x) {
          const tmp = layout[thisIndex].x;
          x = layout[thisIndex].x = tmp + layout[firstCollidedIndex].w;
          layout[firstCollidedIndex].x = tmp;
        } else if (layout[firstCollidedIndex].x + layout[firstCollidedIndex].w === layout[thisIndex].x) {
          const tmp = layout[firstCollidedIndex].x;
          layout[firstCollidedIndex].x = tmp + layout[thisIndex].w;
          x = layout[thisIndex].x = tmp;
        }
      } else {
        const tmp = layout[firstCollidedIndex].x;
        const tmp2 = layout[firstCollidedIndex].y;
        layout[firstCollidedIndex].x = layout[thisIndex].x;
        layout[firstCollidedIndex].y = layout[thisIndex].y;
        x = layout[thisIndex].x = tmp;
        y = layout[thisIndex].y = tmp2;
      }
    }

    this.oldSwapId = firstCollidedIndex !== -1 ? layout[firstCollidedIndex].i : null;

    layout = moveElement(layout, l, x, y, isUserAction, preventCollision, compactType(this.props), cols, allowOverlap);

    this.props.onDrag(layout, oldDragItem, l, placeholder, e, node);

    const newLayout2 = compact(layout, compactType(this.props), cols);
    if (this.canMove(newLayout2)) {
      newLayout = newLayout2;
    }

    if (!this.canMove(newLayout)) {
      newLayout = this.oldLayout;
    }

    this.setState({
      layout: allowOverlap ? layout : newLayout,
      activeDrag: placeholder,
    });
  };

  /**
   * When dragging stops, figure out which position the element is closest to and update its x and y.
   * @param  {String} i Index of the child.
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDragStop = (i, x, y, { e, node }) => {
    if (!this.state.activeDrag) return;

    const { oldDragItem } = this.state;
    let { layout } = this.state;
    const { cols, preventCollision, allowOverlap } = this.props;
    const l = getLayoutItem(layout, i);
    if (!l) return;

    let layout1;

    if (!this.canMove(layout) && this.oldLayout) layout1 = this.oldLayout;
    else layout1 = layout.map((i) => ({ ...i }));

    // Move the element here
    const isUserAction = true;
    layout = moveElement(layout, l, x, y, isUserAction, preventCollision, compactType(this.props), cols, allowOverlap);

    this.props.onDragStop(layout, oldDragItem, l, null, e, node);

    // Set state
    const newLayout = allowOverlap ? layout : compact(layout, compactType(this.props), cols);
    const { oldLayout } = this.state;

    if (this.canMove(newLayout)) layout1 = newLayout;

    this.setState({
      activeDrag: null,
      layout: layout1,
      oldDragItem: null,
      oldLayout: null,
      draggingId: null,
    });

    this.onLayoutMaybeChanged(layout1, oldLayout);
  };

  onLayoutMaybeChanged(newLayout, oldLayout) {
    if (!oldLayout) oldLayout = this.state.layout;

    if (!isEqual(oldLayout, newLayout)) {
      this.props.onLayoutChange(newLayout);
    }
  }

  onResizeStart = (i, w, h, { e, node }) => {
    const { layout } = this.state;
    const l = getLayoutItem(layout, i);
    if (!l) return;

    this.setState({
      oldResizeItem: cloneLayoutItem(l),
      oldLayout: this.state.layout,
      resizingId: i,
    });

    this.props.onResizeStart(layout, l, l, null, e, node);
  };

  onResize = (i, w, h, { e, node, x, y }) => {
    const { layout, oldResizeItem } = this.state;
    const { cols, preventCollision, allowOverlap } = this.props;

    const [newLayout, l] = withLayoutItem(layout, i, (l) => {
      // Something like quad tree should be used
      // to find collisions faster
      let hasCollisions;
      if (preventCollision && !allowOverlap) {
        const collisions = getAllCollisions(layout, { ...l, w, h, x, y }).filter((layoutItem) => layoutItem.i !== l.i);
        hasCollisions = collisions.length > 0;

        // If we're colliding, we need adjust the placeholder.
        if (hasCollisions) {
          // adjust w && h to maximum allowed space
          let leastX = Infinity,
            leastY = Infinity;
          collisions.forEach((layoutItem) => {
            if (layoutItem.x > l.x) leastX = Math.min(leastX, layoutItem.x);
            if (layoutItem.y > l.y) leastY = Math.min(leastY, layoutItem.y);
          });

          if (Number.isFinite(leastX)) l.w = leastX - l.x;
          if (Number.isFinite(leastY)) l.h = leastY - l.y;
        }
      }

      if (!hasCollisions) {
        // Set new width and height.
        l.w = w;
        l.h = h;
        l.x = x;
        l.y = y;
      }

      return l;
    });

    // Shouldn't ever happen, but typechecking makes it necessary
    if (!l) return;

    // Create placeholder element (display only)
    let placeholder = {
      w: l.w,
      h: l.h,
      x: l.x,
      y: l.y,
      static: true,
      i: i,
    };

    this.props.onResize(newLayout, oldResizeItem, l, placeholder, e, node);

    let layout2 = layout.map((i) => ({ ...i }));

    const newLayout2 = compact(newLayout, compactType(this.props), cols);

    if (this.canMove(newLayout2)) {
      this.oldResizePlaceholder = placeholder;
      layout2 = newLayout2;
    } else {
      placeholder = this.oldResizePlaceholder;
    }

    // Re-compact the newLayout and set the drag placeholder.
    this.setState({
      layout: allowOverlap ? newLayout : layout2,
      activeDrag: placeholder,
    });

    return placeholder;
  };

  onResizeStop = (i, w, h, { e, node }) => {
    const { layout, oldResizeItem } = this.state;
    const { cols, allowOverlap } = this.props;
    const l = getLayoutItem(layout, i);

    this.props.onResizeStop(layout, oldResizeItem, l, null, e, node);

    // Set state
    const newLayout = allowOverlap ? layout : compact(layout, compactType(this.props), cols);
    const { oldLayout } = this.state;
    this.setState({
      activeDrag: null,
      layout: newLayout,
      oldResizeItem: null,
      oldLayout: null,
      resizingId: null,
    });

    this.onLayoutMaybeChanged(newLayout, oldLayout);
  };

  /**
   * Create a placeholder object.
   * @return {Element} Placeholder div.
   */
  placeholder() {
    const { activeDrag } = this.state;
    if (!activeDrag) return null;
    const { width, cols, margin, containerPadding, rowHeight, maxRows, useCSSTransforms, transformScale } = this.props;

    // {...this.state.activeDrag} is pretty slow, actually
    return (
      <GridItem
        w={activeDrag.w}
        h={activeDrag.h}
        x={activeDrag.x}
        y={activeDrag.y}
        i={activeDrag.i}
        className="react-grid-placeholder"
        containerWidth={width}
        cols={cols}
        margin={margin}
        containerPadding={containerPadding || margin}
        maxRows={maxRows}
        rowHeight={rowHeight}
        isDraggable={false}
        isResizable={false}
        isBounded={false}
        useCSSTransforms={useCSSTransforms}
        transformScale={transformScale}
      >
        <div />
      </GridItem>
    );
  }

  /**
   * Given a grid item, set its style attributes & surround in a <Draggable>.
   * @param  {Element} child React element.
   * @return {Element}       Element wrapped in draggable and properly placed.
   */
  processGridItem(child, isDroppingItem) {
    if (!child || !child.key) return;
    const l = getLayoutItem(this.state.layout, String(child.key));
    if (!l) return null;
    const {
      width,
      cols,
      margin,
      containerPadding,
      rowHeight,
      maxRows,
      isDraggable,
      isResizable,
      isBounded,
      useCSSTransforms,
      transformScale,
      draggableCancel,
      draggableHandle,
      resizeHandles,
      resizeHandle,
      tooltip,
    } = this.props;
    const { mounted, droppingPosition, draggingId, resizingId } = this.state;

    // Determine user manipulations possible.
    // If an item is static, it can't be manipulated by default.
    // Any properties defined directly on the grid item will take precedence.
    const draggable = typeof l.isDraggable === "boolean" ? l.isDraggable : !l.static && isDraggable;
    const resizable = typeof l.isResizable === "boolean" ? l.isResizable : !l.static && isResizable;
    const resizeHandlesOptions = l.resizeHandles || resizeHandles;

    // isBounded set on child if set on parent, and child is not explicitly false
    const bounded = draggable && isBounded && l.isBounded !== false;

    return (
      <GridItem
        containerWidth={width}
        cols={cols}
        margin={margin}
        containerPadding={containerPadding || margin}
        maxRows={maxRows}
        rowHeight={rowHeight}
        cancel={draggableCancel}
        handle={draggableHandle}
        onDragStop={this.onDragStop}
        onDragStart={this.onDragStart}
        onDrag={this.onDrag}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeStop={this.onResizeStop}
        isDraggable={draggable}
        isResizable={resizable}
        isBounded={bounded}
        useCSSTransforms={useCSSTransforms && mounted}
        usePercentages={!mounted}
        transformScale={transformScale}
        w={l.w}
        h={l.h}
        x={l.x}
        y={l.y}
        i={l.i}
        minH={l.minH}
        minW={l.minW}
        maxH={l.maxH}
        maxW={l.maxW}
        static={l.static}
        droppingPosition={isDroppingItem ? droppingPosition : undefined}
        resizeHandles={resizeHandlesOptions}
        resizeHandle={resizeHandle}
        tooltip={tooltip}
        draggingId={draggingId}
        resizingId={resizingId}
      >
        {child}
      </GridItem>
    );
  }

  // Called while dragging an element. Part of browser native drag/drop API.
  // Native event target might be the layout itself, or an element within the layout.
  onDragOver = (e) => {
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();

    // we should ignore events from layout's children in Firefox
    // to avoid unpredictable jumping of a dropping placeholder
    // FIXME remove this hack
    if (
      isFirefox &&
      // $FlowIgnore can't figure this out
      !e.nativeEvent.targe?.classList.contains(layoutClassName)
    ) {
      return false;
    }

    const { droppingItem, onDropDragOver, margin, cols, rowHeight, maxRows, width, containerPadding, transformScale } =
      this.props;
    // Allow user to customize the dropping item or short-circuit the drop based on the results
    // of the `onDragOver(e: Event)` callback.
    const onDragOverResult = onDropDragOver?.(e);
    if (onDragOverResult === false) {
      if (this.state.droppingDOMNode) {
        this.removeDroppingPlaceholder();
      }
      return false;
    }
    const finalDroppingItem = { ...droppingItem, ...onDragOverResult };

    const { layout } = this.state;
    // This is relative to the DOM element that this event fired for.
    const { layerX, layerY } = e.nativeEvent;
    const droppingPosition = {
      left: layerX / transformScale,
      top: layerY / transformScale,
      e,
    };

    if (!this.state.droppingDOMNode) {
      const positionParams = {
        cols,
        margin,
        maxRows,
        rowHeight,
        containerWidth: width,
        containerPadding: containerPadding || margin,
      };

      const calculatedPosition = calcXY(positionParams, layerY, layerX, finalDroppingItem.w, finalDroppingItem.h);

      this.setState({
        droppingDOMNode: <div key={finalDroppingItem.i} />,
        droppingPosition,
        layout: [
          ...layout,
          {
            ...finalDroppingItem,
            x: calculatedPosition.x,
            y: calculatedPosition.y,
            static: false,
            isDraggable: true,
          },
        ],
      });
    } else if (this.state.droppingPosition) {
      const { left, top } = this.state.droppingPosition;
      const shouldUpdatePosition = left != layerX || top != layerY;
      if (shouldUpdatePosition) {
        this.setState({ droppingPosition });
      }
    }
  };

  removeDroppingPlaceholder = () => {
    const { droppingItem, cols } = this.props;
    const { layout } = this.state;

    const newLayout = compact(
      layout.filter((l) => l.i !== droppingItem.i),
      compactType(this.props),
      cols
    );

    this.setState({
      layout: newLayout,
      droppingDOMNode: null,
      activeDrag: null,
      droppingPosition: undefined,
    });
  };

  onDragLeave = (e) => {
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();
    this.dragEnterCounter--;

    // onDragLeave can be triggered on each layout's child.
    // But we know that count of dragEnter and dragLeave events
    // will be balanced after leaving the layout's container
    // so we can increase and decrease count of dragEnter and
    // when it'll be equal to 0 we'll remove the placeholder
    if (this.dragEnterCounter === 0) {
      this.removeDroppingPlaceholder();
    }
  };

  onDragEnter = (e) => {
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();
    this.dragEnterCounter++;
  };

  onDrop = (e) => {
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();
    const { droppingItem } = this.props;
    const { layout } = this.state;
    const item = layout.find((l) => l.i === droppingItem.i);

    // reset dragEnter counter on drop
    this.dragEnterCounter = 0;

    this.removeDroppingPlaceholder();

    this.props.onDrop(layout, item, e);
  };

  render() {
    const { className, style, isDroppable, innerRef } = this.props;

    const mergedClassName = clsx(layoutClassName, className);
    const mergedStyle = {
      height: this.containerHeight(),
      ...style,
    };

    return (
      <div
        ref={innerRef}
        className={mergedClassName}
        style={mergedStyle}
        onDrop={isDroppable ? this.onDrop : noop}
        onDragLeave={isDroppable ? this.onDragLeave : noop}
        onDragEnter={isDroppable ? this.onDragEnter : noop}
        onDragOver={isDroppable ? this.onDragOver : noop}
      >
        {React.Children.map(this.props.children, (child) => this.processGridItem(child))}
        {isDroppable && this.state.droppingDOMNode && this.processGridItem(this.state.droppingDOMNode, true)}
        {this.placeholder()}
      </div>
    );
  }
}
