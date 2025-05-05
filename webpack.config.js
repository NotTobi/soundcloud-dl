const path = require("path");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = {
  mode: "production",

  entry: {
    content: "./src/content.ts",
    background: "./src/background.ts",
    settings: "./src/settings.ts",
    repostBlocker: "./src/repostBlocker.ts",
  },

  output: {
    // Output JS to dist/js
    path: path.resolve(__dirname, "dist/js"),
    filename: "[name].js",
  },

  resolve: {
    extensions: [".ts", ".js"],
  },

  module: {
    rules: [{ test: /\.ts$/, loader: "ts-loader" }],
  },

  plugins: [
    // Clean only the dist/js directory, as the script expects other files in dist/
    // Note: If CleanWebpackPlugin cleans the whole 'dist', the shell script will fail.
    // Adjust CleanWebpackPlugin options if necessary, or remove it if the shell script handles cleaning.
    new CleanWebpackPlugin(),
  ],

  optimization: {
    minimize: false,
  },
};
