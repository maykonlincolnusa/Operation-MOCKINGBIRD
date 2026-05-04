const HtmlWebpackPlugin = require("html-webpack-plugin");
const { container } = require("webpack");
const { ModuleFederationPlugin } = container;

module.exports = {
  entry: "./src/index.tsx",
  output: { publicPath: "auto", clean: true },
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  module: {
    rules: [
      { test: /\.tsx?$/, loader: "ts-loader", exclude: /node_modules/ },
      { test: /\.css$/, use: ["style-loader", "css-loader", "postcss-loader"] }
    ]
  },
  plugins: [
    new ModuleFederationPlugin({
      name: "shellApp",
      remotes: {
        flowBuilder: "flowBuilder@/mf/flow-builder/remoteEntry.js",
        campaignManager: "campaignManager@/mf/campaign-manager/remoteEntry.js",
        userManager: "userManager@/mf/user-manager/remoteEntry.js",
        analyticsDashboard: "analyticsDashboard@/mf/analytics-dashboard/remoteEntry.js"
      },
      shared: { react: { singleton: true }, "react-dom": { singleton: true } }
    }),
    new HtmlWebpackPlugin({ template: "./src/index.html" })
  ]
};
