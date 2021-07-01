process.env.CHROME_BIN = require("puppeteer").executablePath();

module.exports = function (config) {
  config.set({
    frameworks: ["mocha", "chai"],
    browsers: ["ChromeHeadlessCI"],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: "ChromeHeadless",
        flags: ["--no-sandbox"],
      },
    },
    reporters: ["progress"],
    basePath: process.cwd(),
    colors: true,
    files: ["src/**/*.test.js"],
    port: 9999,
    singleRun: true,
    concurrency: Infinity,
  });
};
