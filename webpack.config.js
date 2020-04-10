const path = require("path");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = {
  mode: "production",

  entry: {
    content: "./src/content.ts",
    background: "./src/background.ts",
  },

  output: {
    path: path.resolve(__dirname, "dist/js"),
    filename: "[name].js",
  },

  resolve: {
    extensions: [".ts", ".js"],
  },

  module: {
    rules: [{ test: /\.ts$/, loader: "ts-loader" }],
  },

  plugins: [new CleanWebpackPlugin()],

  optimization: {
    minimize: false,
  },
};
