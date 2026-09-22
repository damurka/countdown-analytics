const path = require("path");

// React, ReactDOM and shiny.react's own runtime are provided by shiny.react at page load (window.jsmodule),
// so they are external: this bundle holds only the Countdown components. Both apps get their own copy of the
// same build (each app directory is self-contained and deployable on its own; running either needs no Node),
// so this is a multi-compiler config: one entry, two outputs.
const APPS = ["rmncah", "vaxx"];

module.exports = APPS.map((app) => ({
  name: app,
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "..", "apps", app, "www", "cd-react"),
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
