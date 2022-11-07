import ReactDOM from "react-dom";
import { useEffect, useState } from "react";

import GridLayout from "./ReactGridLayout";
import WidthProvider from "./components/WidthProvider";

import "./index.css";
import "./styles.css";

const ReactGridLayout = WidthProvider(GridLayout);

const data = Array.from({ length: 12 }).map((_, index) => ({
  i: "" + index,
  x: (index % 4) * 6,
  y: Math.floor(index / 4) * 20,
  w: 6,
  h: 20,
}));

const margin = 7;
const maxCols = 24;
const maxRows = 60;

const App = () => {
  const [rowHeight, setRowHeight] = useState(50);

  const handleResize = () => {
    setRowHeight((document.documentElement.clientHeight - margin) / maxRows - margin);
  };

  useEffect(() => {
    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <ReactGridLayout
      layout={data}
      margin={[margin, margin]}
      cols={maxCols}
      rowHeight={rowHeight}
      compactType="vertical"
      maxRows={maxRows}
      resizeHandles={["nw", "ne", "se", "sw"]}
      tooltip={{
        showOnHover: true,
        render: ({ w, h }: any) => (
          <div style={{ background: "#eceff1", fontSize: 12, padding: "2px 4px", borderRadius: 4 }}>
            {w} x {h}
          </div>
        ),
      }}
    >
      {data.map(({ i }: any) => {
        return (
          <div key={i}>
            <div style={{ padding: 10 }}>Element: {i}</div>
          </div>
        );
      })}
    </ReactGridLayout>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
