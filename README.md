# RGL

Refer to https://www.npmjs.com/package/react-grid-layout

Add some new features

- Add vertical bound: cannot resize, drag drop if has an element overflow the maxRows
- Add tooltip while resizing, dragging, hovering an element

# Install

`npm i @whknightz/rgl`

# Demo

`npm start`

# Code

```js
import { GridLayout } from "@whknightz/rgl";

import "@whknightz/rgl/dist/styles.css";
import "react-resizable/css/styles.css";

const data = [
  { i: "1", h: 18, w: 6, x: 0, y: 0 },
  { i: "2", h: 20, w: 6, x: 0, y: 18 },
  { i: "3", h: 18, w: 3, x: 9, y: 0 },
  { i: "4", h: 18, w: 3, x: 6, y: 0 },
  { i: "5", h: 18, w: 3, x: 15, y: 0 },
  { i: "6", h: 20, w: 6, x: 6, y: 18 },
  { i: "7", h: 18, w: 3, x: 18, y: 0 },
  { i: "8", h: 18, w: 3, x: 12, y: 0 },
];

const margin = 7;
const maxCols = 24;
const maxRows = 60;

const App = () => {
  return (
    <GridLayout
      layout={data}
      margin={[margin, margin]}
      cols={maxCols}
      rowHeight={rowHeight}
      compactType="vertical"
      maxRows={maxRows}
    >
      {data.map(({ i }) => {
        return (
          <div key={i}>
            <div style={{ padding: 10 }}>Element: {i + 1}</div>
          </div>
        );
      })}
    </GridLayout>
  );
};
```
