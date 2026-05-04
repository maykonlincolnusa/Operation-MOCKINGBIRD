const HtmlWebpackPlugin = require("html-webpack-plugin");
const { container } = require("webpack");
const { ModuleFederationPlugin } = container;
module.exports = {
  entry: "./src/element.tsx",
  output: { publicPath: "auto", clean: true },
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  module: { rules: [{ test: /\.tsx?$/, loader: "ts-loader", exclude: /node_modules/ }, { test: /\.css$/, use: ["style-loader", "css-loader", "postcss-loader"] }] },
  plugins: [new ModuleFederationPlugin({ name: "analyticsDashboard", filename: "remoteEntry.js", exposes: { "./element": "./src/element.tsx" }, shared: { react: { singleton: true }, "react-dom": { singleton: true } } }), new HtmlWebpackPlugin({ template: "./src/index.html" })]
};
