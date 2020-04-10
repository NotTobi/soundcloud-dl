const path = require("path");

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

  optimization: {
    minimize: false,
  },
};
