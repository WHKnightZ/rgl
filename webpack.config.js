const webpack = require("webpack");
const path = require("path");

module.exports = {
  mode: "production",
  optimization: {
    minimize: true,
  },
  entry: "./index.js",
  output: {
    path: path.join(__dirname, "dist"),
    libraryTarget: "commonjs",
    filename: "index.js",
  },
  externals: {
    react: {
      commonjs: "react",
      commonjs2: "react",
      amd: "React",
      root: "React",
    },
    "react-dom": {
      commonjs: "react-dom",
      commonjs2: "react-dom",
      amd: "ReactDOM",
      root: "ReactDOM",
    },
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: "babel-loader",
        options: {
          cacheDirectory: true,
        },
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env": {
        NODE_ENV: JSON.stringify("production"),
      },
    }),
    new webpack.optimize.ModuleConcatenationPlugin(),
  ],
  resolve: {
    modules: [path.resolve("src"), "node_modules"],
    extensions: [".js", ".jsx"],
  },
};
