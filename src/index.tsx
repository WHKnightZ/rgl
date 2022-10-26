import ReactDOM from "react-dom";
import { useEffect, useState } from "react";

import GridLayout from "./ReactGridLayout";
import WidthProvider from "./components/WidthProvider";

import './index.css'
import "./styles.css";

const ReactGridLayout = WidthProvider(GridLayout);

const data = [
  {
    i: "1",
    h: 18,
    w: 6,
    x: 0,
    y: 0,
  },
  { i: "2", h: 20, w: 6, x: 0, y: 18 },
  { i: "3", h: 18, w: 3, x: 9, y: 0 },
  { i: "4", h: 18, w: 3, x: 6, y: 0 },
  { i: "5", h: 18, w: 3, x: 15, y: 0 },
  { i: "6", h: 20, w: 6, x: 6, y: 18 },
  { i: "7", h: 18, w: 3, x: 18, y: 0 },
  { i: "8", h: 18, w: 3, x: 12, y: 0 },
];

const App = () => {
  const [rowHeight, setRowHeight] = useState(50);

  const handleResize = () => {
    setRowHeight((document.documentElement.clientHeight - 7) / 60 - 7);
  };

  useEffect(() => {
    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div style={{ height: "100vh" }}>
      <ReactGridLayout
        layout={data}
        margin={[7, 7]}
        cols={24}
        rowHeight={rowHeight}
        compactType={"vertical"}
        maxRows={60}
      >
        {data.map(({ i }: any) => {
          return <div key={i}></div>;
        })}
      </ReactGridLayout>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
