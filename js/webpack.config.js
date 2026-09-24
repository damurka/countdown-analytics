const path = require("path");

// React, ReactDOM and shiny.react's own runtime are provided by shiny.react at page load (window.jsmodule),
// so they are external: this bundle holds only the Countdown components. It is built into the shared UI
// (apps/_shared/www/cd-react) that every app loads, so running an app needs no Node.
const OUTPUTS = [
  { name: "shared", dir: path.resolve(__dirname, "..", "apps", "_shared", "www", "cd-react") },
];

module.exports = OUTPUTS.map(({ name, dir }) => ({
  name,
  entry: "./src/index.ts",
  output: {
    path: dir,
    filename: "cd-react.js",
  },
  module: {
    rules: [
      {
        test: /\.(t|j)sx?$/,
        exclude: /node_modules/,
        use: "babel-loader",
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
  externals: {
    react: "jsmodule['react']",
    "react-dom": "jsmodule['react-dom']",
    "@/shiny.react": "jsmodule['@/shiny.react']",
  },
  devtool: "source-map",
}));
